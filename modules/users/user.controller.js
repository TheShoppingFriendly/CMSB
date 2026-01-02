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
  const { wp_user_id, conversion_ids, reason } = req.body;
  const adminId = req.admin ? req.admin.id : null;

  try {
    await db.query("BEGIN");

    // A. Snapshot "Before" Balance
    const userRes = await db.query(
      "SELECT current_balance FROM users WHERE wp_user_id = $1 FOR UPDATE", 
      [wp_user_id]
    );
    if (userRes.rows.length === 0) throw new Error("User not found.");
    const prevBalance = parseFloat(userRes.rows[0].current_balance || 0);

    // B. Calculate Payout & Verify Ownership via JOIN
    const convRes = await db.query(
      `SELECT c.id, c.payout, ct.campaign_id 
       FROM conversions c
       JOIN click_tracking ct ON c.click_id = ct.id
       WHERE c.id = ANY($1) 
       AND ct.wp_user_id = $2 
       AND c.payout_status = 'pending'`,
      [conversion_ids, wp_user_id]
    );

    if (convRes.rows.length === 0) throw new Error("No eligible pending conversions found.");

    const amountToAdd = convRes.rows.reduce((sum, row) => sum + parseFloat(row.payout), 0);
    const summary = `Paid ${convRes.rows.length} items: ${convRes.rows.map(r => r.campaign_id).join(", ")}`;

    // C. Update Balance (Snapshot "After")
    const updateRes = await db.query(
      `UPDATE users SET current_balance = current_balance + $1, total_earned = total_earned + $1
       WHERE wp_user_id = $2 RETURNING current_balance`,
      [amountToAdd, wp_user_id]
    );
    const newBal = parseFloat(updateRes.rows[0].current_balance);

    // D. Create Audit Log with Snapshot
    const logRes = await db.query(
      `INSERT INTO balance_logs (wp_user_id, amount_changed, previous_balance, new_balance, action_type, reason, admin_id, campaign_summary)
       VALUES ($1, $2, $3, $4, 'settlement', $5, $6, $7) RETURNING id`,
      [wp_user_id, amountToAdd, prevBalance, newBal, reason, adminId, summary]
    );

    // E. Tag Conversions as Approved and link to Log
    await db.query(
      "UPDATE conversions SET payout_status = 'approved', log_id = $1 WHERE id = ANY($2)",
      [logRes.rows[0].id, conversion_ids]
    );

    await db.query("COMMIT");
    res.json({ success: true, newBalance: newBal, amountAdded: amountToAdd });
  } catch (error) {
    await db.query("ROLLBACK");
    console.error("Settlement Error:", error.message);
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