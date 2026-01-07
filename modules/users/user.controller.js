import db from "../../db.js";

// 1. Sync Users from WordPress (UPSERT logic) - NO CHANGES
// --- HELPERS ---

// Generates the TGBRXXXXX format
const generateTGBRCode = () => {
    const digits = Math.floor(10000 + Math.random() * 90000); 
    return `TGBR${digits}`;
};

// Logic to link the Referee to the Referrer
const linkReferral = async (refereeWpId, refCode, refereeIp) => {
    try {
        // 1. Find who owns the referral code (User 1)
        const referrerRes = await db.query(
            "SELECT wp_user_id, registration_ip FROM users WHERE referral_code = $1",
            [refCode]
        );

        if (referrerRes.rows.length === 0) return; // Code doesn't exist

        const referrer = referrerRes.rows[0];

        // 2. Scam Prevention: Check if IPs match
        const status = (referrer.registration_ip === refereeIp) ? 'flagged' : 'pending';

        // 3. Insert into referrals table (ON CONFLICT prevents duplicate referrals)
        await db.query(
            `INSERT INTO referrals (referrer_wp_id, referee_wp_id, registration_ip, status)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (referee_wp_id) DO NOTHING`,
            [referrer.wp_user_id, refereeWpId, refereeIp, status]
        );
    } catch (err) {
        console.error("Linking Error:", err.message);
    }
};

// --- CONTROLLERS ---

// 1. Sync Users from WordPress (NOW WITH REFERRAL LOGIC)
export const syncUsers = async (req, res) => {
    const { users } = req.body;
    if (!Array.isArray(users)) {
        return res.status(400).json({ error: "Invalid user data format" });
    }

    try {
        for (const user of users) {
            // Generate a code for the user if they don't have one (for User 3 or new users)
            const newGeneratedCode = generateTGBRCode();

            // UPSERT User: Save IP and generate TGBR code if missing
            const result = await db.query(
                `INSERT INTO users (wp_user_id, email, name, referral_code, registration_ip)
                 VALUES ($1, $2, $3, $4, $5)
                 ON CONFLICT (wp_user_id) 
                 DO UPDATE SET 
                    email = EXCLUDED.email, 
                    name = EXCLUDED.name,
                    registration_ip = COALESCE(users.registration_ip, EXCLUDED.registration_ip),
                    referral_code = COALESCE(users.referral_code, EXCLUDED.referral_code)
                 RETURNING referral_code`,
                [user.wp_user_id, user.email, user.name, newGeneratedCode, user.user_ip]
            );

            // If this user was referred by someone (User 2 logic)
            if (user.ref_code) {
                await linkReferral(user.wp_user_id, user.ref_code, user.user_ip);
            }
        }
        res.json({ success: true, message: `Synced ${users.length} users and updated referrals.` });
    } catch (error) {
        console.error("Sync Error:", error.message);
        res.status(500).json({ error: "Database sync failed" });
    }
};

// 2. Get User Stats (NOW INCLUDES REFERRAL CODE FOR DASHBOARD)
export const getUserStats = async (req, res) => {
    const { id } = req.params;
    try {
        const result = await db.query(
            "SELECT current_balance, total_earned, referral_code FROM users WHERE wp_user_id = $1",
            [id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: "User not found" });
        }

        const user = result.rows[0];
        res.json({
            success: true,
            balances: {
                available: user.current_balance || 0,
                pending: 0, // You can add logic for this later
                locked: 0
            },
            referral_code: user.referral_code || "" // This goes back to WP Dashboard
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// 2. Fetch all users for Admin Dashboard - NO CHANGES
export const getAllUsers = async (req, res) => {
  try {
    const result = await db.query(`SELECT * FROM users ORDER BY synced_at DESC`);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// 3. UPDATED: Manual Balance Update & Conversion Settlement
// Now handles custom amounts, lock days (release date), and Cashback
export const updateUserBalance = async (req, res) => {
  const { wp_user_id, settlements, reason } = req.body; 
  const adminId = req.admin ? req.admin.id : null;

  try {
    await db.query("BEGIN");

    // 1. Snapshot Current Balance
    const userRes = await db.query("SELECT current_balance FROM users WHERE wp_user_id = $1 FOR UPDATE", [wp_user_id]);
    const prevBalance = parseFloat(userRes.rows[0].current_balance || 0);

    // 2. Calculate Total from the Custom Amounts (supports negative for Cashback)
    const totalDelta = settlements.reduce((sum, item) => sum + parseFloat(item.amount), 0);

    // 3. Update User Balance & Total Earned
    const updateRes = await db.query(
      `UPDATE users SET current_balance = current_balance + $1, total_earned = total_earned + $1
       WHERE wp_user_id = $2 RETURNING current_balance`,
      [totalDelta, wp_user_id]
    );
    const newBal = parseFloat(updateRes.rows[0].current_balance);

    // 4. Log the Audit Trail (Status defaults to 'active')
    const logRes = await db.query(
      `INSERT INTO balance_logs (wp_user_id, amount_changed, previous_balance, new_balance, action_type, reason, admin_id)
       VALUES ($1, $2, $3, $4, 'settlement', $5, $6) RETURNING id`,
      [wp_user_id, totalDelta, prevBalance, newBal, reason, adminId]
    );
    const logId = logRes.rows[0].id;

    // 5. Update each individual conversion with Actual Amount + Release Date
    for (const item of settlements) {
      const days = parseInt(item.lock_days) || 0;
      const releaseDate = new Date();
      releaseDate.setDate(releaseDate.getDate() + days);

      await db.query(
        `UPDATE conversions 
         SET payout_status = 'approved', 
             actual_paid_amount = $1, 
             log_id = $2,
             release_date = $3 
         WHERE id = $4`,
        [item.amount, logId, releaseDate, item.id]
      );
    }

    await db.query("COMMIT");
    res.json({ success: true, newBalance: newBal });
  } catch (error) {
    await db.query("ROLLBACK");
    res.status(500).json({ error: error.message });
  }
};

// 4. NEW: Revert Settlement (Handles reversing both Payments and Cashbacks)
export const revertSettlement = async (req, res) => {
  const { log_id } = req.body;
  try {
    await db.query("BEGIN");

    // 1. Get the original log
    const logRes = await db.query("SELECT * FROM balance_logs WHERE id = $1 AND status != 'reverted'", [log_id]);
    if (logRes.rows.length === 0) throw new Error("Transaction not found or already reverted.");
    
    const { wp_user_id, amount_changed } = logRes.rows[0];

    // 2. Mathematically reverse the balance change (Subtracting a negative adds it back)
    await db.query(
      `UPDATE users 
       SET current_balance = current_balance - $1, 
           total_earned = total_earned - $1 
       WHERE wp_user_id = $2`,
      [amount_changed, wp_user_id]
    );

    // 3. Reset linked conversions back to pending
    await db.query(
      `UPDATE conversions 
       SET payout_status = 'pending', 
           actual_paid_amount = NULL, 
           log_id = NULL, 
           release_date = NULL 
       WHERE log_id = $1`,
      [log_id]
    );

    // 4. Mark the log as reverted
    await db.query("UPDATE balance_logs SET status = 'reverted' WHERE id = $1", [log_id]);

    await db.query("COMMIT");
    res.json({ success: true, message: "Transaction reverted successfully." });
  } catch (error) {
    await db.query("ROLLBACK");
    console.error("Reversal Error:", error.message);
    res.status(500).json({ error: error.message });
  }
};

// 5. Fetch User Specific Activity - UPDATED to include new fields
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

    // B. Conversions (Now includes release_date and actual_paid_amount)
    const conversions = await db.query(
      `SELECT 
        c.id, 
        ct.clickid, 
        ct.campaign_id, 
        c.payout, 
        c.actual_paid_amount,
        c.commission, 
        c.status, 
        c.payout_status,
        c.release_date,
        c.created_at 
       FROM conversions c
       JOIN click_tracking ct ON c.click_id = ct.id
       WHERE ct.wp_user_id = $1 
       ORDER BY c.created_at DESC`,
      [id]
    ).catch(e => ({ rows: [] }));

    // C. Balance Logs (Now includes id and status for reversal logic)
    const logs = await db.query(
      `SELECT 
        id,
        amount_changed, 
        previous_balance, 
        new_balance, 
        reason, 
        status,
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