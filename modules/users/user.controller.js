import db from "../../db.js";

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

        if (referrerRes.rows.length === 0) return; 

        const referrer = referrerRes.rows[0];

        // 2. Scam Prevention: Check if IPs match
        const status = (referrer.registration_ip === refereeIp) ? 'flagged' : 'pending';

        // 3. Insert into referrals table
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

// 1. Sync Users from WordPress
export const syncUsers = async (req, res) => {
    const { users } = req.body;
    if (!Array.isArray(users)) {
        return res.status(400).json({ error: "Invalid user data format" });
    }

    try {
        for (const user of users) {
            const newGeneratedCode = generateTGBRCode();

            // UPSERT User
            await db.query(
                `INSERT INTO users (wp_user_id, email, name, referral_code, registration_ip)
                 VALUES ($1, $2, $3, $4, $5)
                 ON CONFLICT (wp_user_id) 
                 DO UPDATE SET 
                    email = EXCLUDED.email, 
                    name = EXCLUDED.name,
                    registration_ip = COALESCE(users.registration_ip, EXCLUDED.registration_ip),
                    referral_code = COALESCE(users.referral_code, EXCLUDED.referral_code)`,
                [user.wp_user_id, user.email, user.name, newGeneratedCode, user.user_ip]
            );

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

// 2. Get User Stats (UPDATED with Referral Totals)
export const getUserStats = async (req, res) => {
    const { id } = req.params;
    try {
        const result = await db.query(
            `SELECT u.current_balance, u.total_earned, u.referral_code,
             (SELECT COALESCE(SUM(total_earned_from_referee), 0) FROM referrals WHERE referrer_wp_id = u.wp_user_id) as total_ref_earnings
             FROM users u WHERE u.wp_user_id = $1`,
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
                pending: 0, 
                locked: 0,
                referral_total: user.total_ref_earnings || 0
            },
            referral_code: user.referral_code || "" 
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
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

// 3. UPDATED: Manual Balance Update & Conversion Settlement (With Referral Logic)
// 3. UPDATED: Manual Balance Update & Conversion Settlement
export const updateUserBalance = async (req, res) => {
  const { wp_user_id, settlements, reason } = req.body; 
  const adminId = req.admin ? req.admin.id : null;

  try {
    await db.query("BEGIN");

    // 1. Snapshot Current Balance + Row Lock
    const userRes = await db.query(
        "SELECT current_balance FROM users WHERE wp_user_id = $1 FOR UPDATE", 
        [wp_user_id]
    );
    
    if (userRes.rows.length === 0) throw new Error("User not found in database.");
    
    const prevBalance = parseFloat(userRes.rows[0].current_balance || 0);

    // 2. Calculate Total Delta (Safely handle numbers)
    const totalDelta = settlements.reduce((sum, item) => {
        const amt = parseFloat(item.amount);
        return sum + (isNaN(amt) ? 0 : amt);
    }, 0);

    // 3. Update User Balance & Total Earned
    // We use COALESCE to prevent NULL and RETURNING to get the exact new balance
    const updateRes = await db.query(
      `UPDATE users 
       SET current_balance = current_balance + $1, 
           total_earned = total_earned + CASE WHEN $1 > 0 THEN $1 ELSE 0 END
       WHERE wp_user_id = $2 
       RETURNING current_balance`,
      [totalDelta, wp_user_id]
    );

    if (updateRes.rows.length === 0) throw new Error("Failed to update user balance.");
    
    const newBal = parseFloat(updateRes.rows[0].current_balance);

    // 4. Log the Audit Trail (ENSURE newBal is not NULL)
    const logRes = await db.query(
      `INSERT INTO balance_logs (wp_user_id, amount_changed, previous_balance, new_balance, action_type, reason, admin_id)
       VALUES ($1, $2, $3, $4, 'settlement', $5, $6) RETURNING id`,
      [wp_user_id, totalDelta, prevBalance, newBal, reason, adminId]
    );
    const logId = logRes.rows[0].id;

    // 5. Update each individual conversion
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

    // --- REFERRAL COMMISSION CALCULATION (USER 1 EARNINGS) ---
    if (totalDelta > 0) {
        const refRes = await db.query(
            "SELECT referrer_wp_id FROM referrals WHERE referee_wp_id = $1 AND status != 'blocked'",
            [wp_user_id]
        );

        if (refRes.rows.length > 0) {
            const referrerId = refRes.rows[0].referrer_wp_id;
            const commissionAmount = totalDelta * 0.10; // 10%

            await db.query(
                `UPDATE users SET current_balance = current_balance + $1, total_earned = total_earned + $1 WHERE wp_user_id = $2`,
                [commissionAmount, referrerId]
            );

            await db.query(
                `INSERT INTO balance_logs (wp_user_id, amount_changed, action_type, reason, status)
                 VALUES ($1, $2, 'referral_earning', $3, 'active')`,
                [referrerId, commissionAmount, `Commission from Friend #${wp_user_id} activity`]
            );

            await db.query(
                `UPDATE referrals SET total_earned_from_referee = total_earned_from_referee + $1, status = 'approved'
                 WHERE referee_wp_id = $2`,
                [commissionAmount, wp_user_id]
            );
        }
    }

    await db.query("COMMIT");
    res.json({ success: true, newBalance: newBal });
  } catch (error) {
    await db.query("ROLLBACK");
    console.error("Settlement Error:", error.message);
    res.status(500).json({ error: error.message });
  }
};

// 4. UPDATED: Revert Settlement (Handles reversing Referral Commissions)
export const revertSettlement = async (req, res) => {
  const { log_id } = req.body;
  try {
    await db.query("BEGIN");

    // 1. Get the original log
    const logRes = await db.query(
        "SELECT * FROM balance_logs WHERE id = $1 AND status != 'reverted' FOR UPDATE", 
        [log_id]
    );
    
    if (logRes.rows.length === 0) {
        throw new Error("Transaction not found or already reverted.");
    }
    
    const { wp_user_id, amount_changed } = logRes.rows[0];
    const amountToReverse = parseFloat(amount_changed);

    // 2. Mathematically reverse User 2's balance
    const updateUserRes = await db.query(
      `UPDATE users 
       SET current_balance = current_balance - $1, 
           total_earned = total_earned - CASE WHEN $1 > 0 THEN $1 ELSE 0 END 
       WHERE wp_user_id = $2
       RETURNING current_balance`,
      [amountToReverse, wp_user_id]
    );

    if (updateUserRes.rows.length === 0) throw new Error("User record not found for reversal.");

    // --- NEW: REVERSE REFERRAL COMMISSION (USER 1) ---
    if (amountToReverse > 0) {
        // Find if this user has a referrer
        const refRes = await db.query(
            "SELECT referrer_wp_id FROM referrals WHERE referee_wp_id = $1", 
            [wp_user_id]
        );
        
        if (refRes.rows.length > 0) {
            const referrerId = refRes.rows[0].referrer_wp_id;
            const refAmountToTakeBack = amountToReverse * 0.10;

            // Snapshot Referrer's current state to calculate new_balance for logs
            const refState = await db.query("SELECT current_balance FROM users WHERE wp_user_id = $1 FOR UPDATE", [referrerId]);
            const refPrevBal = parseFloat(refState.rows[0].current_balance || 0);

            // Subtract from User 1
            const updateRefRes = await db.query(
                `UPDATE users 
                 SET current_balance = current_balance - $1, 
                     total_earned = total_earned - $1 
                 WHERE wp_user_id = $2
                 RETURNING current_balance`,
                [refAmountToTakeBack, referrerId]
            );

            const refNewBal = parseFloat(updateRefRes.rows[0].current_balance);

            // Log the reversal for User 1 (Prevents NULL in new_balance)
            await db.query(
                `INSERT INTO balance_logs (wp_user_id, amount_changed, previous_balance, new_balance, action_type, reason, status)
                 VALUES ($1, $2, $3, $4, 'referral_reversal', $5, 'reverted')`,
                [referrerId, -refAmountToTakeBack, refPrevBal, refNewBal, `Reversal of commission from Friend #${wp_user_id}`]
            );

            // Subtract from the referral table stats
            await db.query(
                `UPDATE referrals 
                 SET total_earned_from_referee = total_earned_from_referee - $1 
                 WHERE referee_wp_id = $2`,
                [refAmountToTakeBack, wp_user_id]
            );
        }
    }

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

    // 4. Mark the original log as reverted
    await db.query("UPDATE balance_logs SET status = 'reverted' WHERE id = $1", [log_id]);

    await db.query("COMMIT");
    res.json({ success: true, message: "Transaction and linked referral commissions reverted successfully." });
  } catch (error) {
    await db.query("ROLLBACK");
    console.error("Reversal Error:", error.message);
    res.status(500).json({ error: error.message });
  }
};

// 5. Fetch User Specific Activity
export const getUserActivity = async (req, res) => {
  const { id } = req.params; 
  try {
    if (!id) return res.status(400).json({ error: "Missing user ID" });

    const clicks = await db.query(
      `SELECT clickid, ip_address, created_at FROM click_tracking WHERE wp_user_id = $1 ORDER BY created_at DESC LIMIT 50`,
      [id]
    ).catch(e => ({ rows: [] }));

    const conversions = await db.query(
      `SELECT c.id, ct.clickid, ct.campaign_id, c.payout, c.actual_paid_amount, c.commission, c.status, c.payout_status, c.release_date, c.created_at 
       FROM conversions c JOIN click_tracking ct ON c.click_id = ct.id WHERE ct.wp_user_id = $1 ORDER BY c.created_at DESC`,
      [id]
    ).catch(e => ({ rows: [] }));

    const logs = await db.query(
      `SELECT id, amount_changed, previous_balance, new_balance, reason, status, campaign_summary, created_at 
       FROM balance_logs WHERE wp_user_id = $1 ORDER BY created_at DESC`,
      [id]
    ).catch(e => ({ rows: [] }));

    res.json({ clicks: clicks.rows, conversions: conversions.rows, logs: logs.rows });
  } catch (error) {
    res.status(500).json({ error: "Internal Server Error" });
  }
};