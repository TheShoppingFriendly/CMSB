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

// 3. Manual Balance Update with Audit Logging
export const updateUserBalance = async (req, res) => {
  const { wp_user_id, amount, reason } = req.body;
  const adminId = req.admin ? req.admin.id : null; 

  try {
    await db.query("BEGIN");

    const userUpdate = await db.query(
      `UPDATE users 
       SET current_balance = current_balance + $1, 
           total_earned = CASE WHEN $1 > 0 THEN total_earned + $1 ELSE total_earned END
       WHERE wp_user_id = $2 
       RETURNING current_balance`,
      [amount, wp_user_id]
    );

    if (userUpdate.rows.length === 0) throw new Error("User not found.");

    const newBalance = userUpdate.rows[0].current_balance;

    await db.query(
      `INSERT INTO balance_logs (wp_user_id, amount_changed, new_balance, action_type, reason, admin_id)
       VALUES ($1, $2, $3, 'admin_adjustment', $4, $5)`,
      [wp_user_id, amount, newBalance, reason || "Manual adjustment", adminId]
    );

    await db.query("COMMIT");
    res.json({ success: true, newBalance });
  } catch (error) {
    await db.query("ROLLBACK");
    res.status(500).json({ error: error.message });
  }
};

// 4. NEW: Fetch User Specific Activity (Clicks, Conversions, and Logs)
export const getUserActivity = async (req, res) => {
  const { id } = req.params; // This is the wp_user_id from the URL

  try {
    // Fetch Clicks
    const clicks = await db.query(
      `SELECT clickid, ip_address, created_at FROM clicks 
       WHERE wp_user_id = $1 ORDER BY created_at DESC LIMIT 20`,
      [id]
    );

    // Fetch Conversions
    const conversions = await db.query(
      `SELECT campaign_name, payout, status, created_at FROM conversions 
       WHERE wp_user_id = $1 ORDER BY created_at DESC LIMIT 20`,
      [id]
    );

    // Fetch Audit Logs (Balance History)
    const logs = await db.query(
      `SELECT amount_changed, new_balance, reason, created_at FROM balance_logs 
       WHERE wp_user_id = $1 ORDER BY created_at DESC LIMIT 20`,
      [id]
    );

    res.json({
      clicks: clicks.rows,
      conversions: conversions.rows,
      logs: logs.rows
    });
  } catch (error) {
    console.error("Activity Fetch Error:", error.message);
    res.status(500).json({ error: "Failed to fetch user history" });
  }
};