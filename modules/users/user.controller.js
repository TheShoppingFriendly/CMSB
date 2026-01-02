import db from "../../db.js";

// 1. Sync Users from WordPress (UPSERT logic)
export const syncUsers = async (req, res) => {
  const { users } = req.body;
  if (!Array.isArray(users)) {
    return res.status(400).json({ error: "Invalid user data format" });
  }

  try {
    for (const user of users) {
      await db.query(
        `INSERT INTO users (wp_user_id, email, name)
         VALUES ($1, $2, $3)
         ON CONFLICT (wp_user_id) 
         DO UPDATE SET email = EXCLUDED.email, name = EXCLUDED.name`,
        [user.wp_user_id, user.email, user.name]
      );
    }
    res.json({ success: true, message: `Synced ${users.length} users` });
  } catch (error) {
    console.error("Sync Error:", error.message);
    res.status(500).json({ error: "Database sync failed" });
  }
};

// 2. Fetch all users for Admin Dashboard
export const getAllUsers = async (req, res) => {
  try {
    const result = await db.query(`SELECT * FROM users ORDER BY synced_at DESC`);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// 3. Manual Balance Update & Conversion Settlement
// This handles the "Before/After" snapshot and tags conversions
export const updateUserBalance = async (req, res) => {
  const { wp_user_id, settlements, reason } = req.body; // settlements = [{id, amount}, ...]
  const adminId = req.admin ? req.admin.id : null;

  try {
    await db.query("BEGIN");

    // 1. Snapshot Current Balance
    const userRes = await db.query("SELECT current_balance FROM users WHERE wp_user_id = $1 FOR UPDATE", [wp_user_id]);
    const prevBalance = parseFloat(userRes.rows[0].current_balance || 0);

    // 2. Calculate Total from the Custom Amounts sent by Admin
    const totalDelta = settlements.reduce((sum, item) => sum + parseFloat(item.amount), 0);

    // 3. Update User Balance
    const updateRes = await db.query(
      `UPDATE users SET current_balance = current_balance + $1, total_earned = total_earned + $1
       WHERE wp_user_id = $2 RETURNING current_balance`,
      [totalDelta, wp_user_id]
    );
    const newBal = parseFloat(updateRes.rows[0].current_balance);

    // 4. Log the Audit Trail
    const logRes = await db.query(
      `INSERT INTO balance_logs (wp_user_id, amount_changed, previous_balance, new_balance, action_type, reason, admin_id)
       VALUES ($1, $2, $3, $4, 'settlement', $5, $6) RETURNING id`,
      [wp_user_id, totalDelta, prevBalance, newBal, reason, adminId]
    );

    // 5. Update each individual conversion with the ACTUAL amount paid
    for (const item of settlements) {
      await db.query(
        `UPDATE conversions 
         SET payout_status = 'approved', 
             actual_paid_amount = $1, 
             log_id = $2 
         WHERE id = $3`,
        [item.amount, logRes.rows[0].id, item.id]
      );
    }

    await db.query("COMMIT");
    res.json({ success: true, newBalance: newBal });
  } catch (error) {
    await db.query("ROLLBACK");
    res.status(500).json({ error: error.message });
  }
};

// 4. Fetch User Specific Activity (Clicks, Conversions, and Audited Logs)
export const getUserActivity = async (req, res) => {
  const { id } = req.params; 

  try {
    if (!id) return res.status(400).json({ error: "Missing user ID" });

    // A. Clicks
    const clicks = await db.query(
      `SELECT clickid, ip_address, created_at FROM click_tracking 
       WHERE wp_user_id = $1 ORDER BY created_at DESC LIMIT 50`,
      [id]
    ).catch(e => ({ rows: [] }));

    // B. Conversions (Crucial: Included ID and payout_status for Frontend logic)
    const conversions = await db.query(
      `SELECT 
        c.id, 
        ct.clickid, 
        ct.campaign_id, 
        c.payout, 
        c.commission, 
        c.status, 
        c.payout_status,
        c.created_at 
       FROM conversions c
       JOIN click_tracking ct ON c.click_id = ct.id
       WHERE ct.wp_user_id = $1 
       ORDER BY c.created_at DESC`,
      [id]
    ).catch(e => ({ rows: [] }));

    // C. Balance Logs (Included Snapshots for the Ledger table)
    const logs = await db.query(
      `SELECT 
        amount_changed, 
        previous_balance, 
        new_balance, 
        reason, 
        campaign_summary, 
        created_at 
       FROM balance_logs 
       WHERE wp_user_id = $1 
       ORDER BY created_at DESC`,
      [id]
    ).catch(e => ({ rows: [] }));

    res.json({
      clicks: clicks.rows,
      conversions: conversions.rows,
      logs: logs.rows
    });

  } catch (error) {
    console.error("Activity Fetch Error:", error.message);
    res.status(500).json({ error: "Internal Server Error" });
  }
};