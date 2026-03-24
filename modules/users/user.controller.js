import db from "../../db.js";

// --- HELPERS ---
const generateTGBRCode = () => {
    const digits = Math.floor(10000 + Math.random() * 90000); 
    return `TGBR${digits}`;
};

const linkReferral = async (refereeWpId, refCode, refereeIp) => {
    try {
        const referrerRes = await db.query(
            "SELECT wp_user_id, registration_ip FROM users WHERE referral_code = $1",
            [refCode]
        );
        
        if (referrerRes.rows.length === 0) return; 

        const referrer = referrerRes.rows[0];
        const status = (referrer.registration_ip === refereeIp) ? 'flagged' : 'pending';

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

export const syncUsers = async (req, res) => {
    const { users } = req.body;

    if (!Array.isArray(users)) {
        return res.status(400).json({ error: "Invalid user data format" });
    }

    try {
        for (const user of users) {
            const newGeneratedCode = generateTGBRCode();

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

        res.json({ success: true });

    } catch (error) {
        console.error("Sync Error:", error.message);
        res.status(500).json({ error: "Database sync failed" });
    }
};


// ✅ GET USER STATS (CORRECT)
export const getUserStats = async (req, res) => {
    const { id } = req.params;

    try {
        const result = await db.query(
            `SELECT 
                uw.affiliate_balance,
                uw.affiliate_pending,
                uw.referral_balance,
                uw.reward_cash_balance,
                uw.total_lifetime_earned,
                u.referral_code,
                (SELECT COALESCE(SUM(total_earned_from_referee), 0) 
                 FROM referrals 
                 WHERE referrer_wp_id = u.wp_user_id) as total_ref_earnings
             FROM user_wallets uw
             JOIN users u ON u.wp_user_id = uw.wp_user_id
             WHERE uw.wp_user_id = $1`,
            [id]
        );

        if (!result.rows.length) {
            return res.status(404).json({ error: "User not found" });
        }

        const user = result.rows[0];

        res.json({
            success: true,
            balances: {
                available: user.affiliate_balance || 0,
                pending: user.affiliate_pending || 0,
                locked: 0,
                referral_total: user.total_ref_earnings || 0
            },
            referral_code: user.referral_code || ""
        });

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};


// ✅ ADMIN USER LIST (FIXED BALANCE)
export const getAllUsers = async (req, res) => {
  try {
    const result = await db.query(`
      SELECT 
        u.*,
        uw.affiliate_balance
      FROM users u
      LEFT JOIN user_wallets uw 
        ON u.wp_user_id = uw.wp_user_id
      ORDER BY u.synced_at DESC
    `);

    res.json(result.rows);

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};


// ✅ MAIN SETTLEMENT FUNCTION (FIXED)
export const updateUserBalance = async (req, res) => {
  const { wp_user_id, settlements, reason, finance_category } = req.body;
  const adminId = req.admin ? req.admin.id : null;

  try {
    await db.query("BEGIN");

    const userRes = await db.query(
      `SELECT affiliate_balance, affiliate_pending 
       FROM user_wallets 
       WHERE wp_user_id = $1 FOR UPDATE`,
      [wp_user_id]
    );

    if (!userRes.rows.length) throw new Error("Wallet not found");

    const wallet = userRes.rows[0];

    const previousBalance = parseFloat(wallet.affiliate_balance || 0);
    const totalDelta = settlements.reduce((sum, s) => sum + parseFloat(s.amount), 0);
    const newBalance = previousBalance + totalDelta;

    // ✅ MOVE pending → balance
    await db.query(
      `UPDATE user_wallets 
       SET 
         affiliate_pending = affiliate_pending - $1,
         affiliate_balance = affiliate_balance + $1,
         total_lifetime_earned = total_lifetime_earned + $1
       WHERE wp_user_id = $2`,
      [totalDelta, wp_user_id]
    );

    // ✅ SYNC USERS TABLE
    await db.query(
      `UPDATE users 
       SET 
         current_balance = current_balance + $1,
         total_earned = total_earned + $1
       WHERE wp_user_id = $2`,
      [totalDelta, wp_user_id]
    );

    // ✅ REFERRAL
    const refRes = await db.query(
      "SELECT referrer_wp_id FROM referrals WHERE referee_wp_id = $1",
      [wp_user_id]
    );

    if (refRes.rows.length > 0) {
      const referrerId = refRes.rows[0].referrer_wp_id;
      const commission = totalDelta * 0.10;

      await db.query(
        `UPDATE user_wallets 
         SET referral_balance = referral_balance + $1
         WHERE wp_user_id = $2`,
        [commission, referrerId]
      );

      await db.query(
        `UPDATE users 
         SET current_balance = current_balance + $1
         WHERE wp_user_id = $2`,
        [commission, referrerId]
      );

      await db.query(
        `UPDATE referrals 
         SET total_earned_from_referee = total_earned_from_referee + $1
         WHERE referee_wp_id = $2`,
        [commission, wp_user_id]
      );
    }

    // ✅ LOG
    const logRes = await db.query(
      `INSERT INTO balance_logs (
        wp_user_id, amount_changed, previous_balance, new_balance, action_type, reason, wallet_type
      )
      VALUES ($1, $2, $3, $4, 'settlement', $5, 'affiliate')
      RETURNING id`,
      [wp_user_id, totalDelta, previousBalance, newBalance, reason || 'Settlement']
    );

    const logId = logRes.rows[0].id;

    const conversionIds = settlements.map(s => s.id);

    if (conversionIds.length > 0) {
      await db.query(
        `UPDATE conversions
         SET payout_status = 'paid',
             actual_paid_amount = payout,
             release_date = NOW(),
             log_id = $2
         WHERE id = ANY($1::int[])`,
        [conversionIds, logId]
      );
    }

    // ✅ HARD SYNC (FINAL GUARANTEE)
    await db.query(
      `UPDATE users u
       SET current_balance = uw.affiliate_balance
       FROM user_wallets uw
       WHERE u.wp_user_id = uw.wp_user_id
         AND u.wp_user_id = $1`,
      [wp_user_id]
    );

    await db.query("COMMIT");

    res.json({ success: true });

  } catch (error) {
    await db.query("ROLLBACK");
    res.status(500).json({ error: error.message });
  }
};

export const revertSettlement = async (req, res) => {
  const { log_id } = req.body;

  try {
    await db.query("BEGIN");

    // 1. Get log
    const logRes = await db.query(
      "SELECT * FROM balance_logs WHERE id = $1 AND status != 'reverted' FOR UPDATE",
      [log_id]
    );

    if (!logRes.rows.length) {
      throw new Error("Transaction not found or already reverted");
    }

    const log = logRes.rows[0];
    const wp_user_id = log.wp_user_id;
    const amountToReverse = parseFloat(log.amount_changed || 0);

    // 2. Reverse USER WALLET
    await db.query(
      `UPDATE user_wallets
       SET affiliate_balance = affiliate_balance - $1
       WHERE wp_user_id = $2`,
      [amountToReverse, wp_user_id]
    );

    // 3. Reverse USERS TABLE (SYNC)
    await db.query(
      `UPDATE users
       SET current_balance = current_balance - $1,
           total_earned = total_earned - CASE WHEN $1 > 0 THEN $1 ELSE 0 END
       WHERE wp_user_id = $2`,
      [amountToReverse, wp_user_id]
    );

    // 4. Reverse REFERRAL (if exists)
    const refRes = await db.query(
      "SELECT referrer_wp_id FROM referrals WHERE referee_wp_id = $1",
      [wp_user_id]
    );

    if (refRes.rows.length > 0) {
      const referrerId = refRes.rows[0].referrer_wp_id;
      const commission = amountToReverse * 0.10;

      await db.query(
        `UPDATE user_wallets
         SET referral_balance = referral_balance - $1
         WHERE wp_user_id = $2`,
        [commission, referrerId]
      );

      await db.query(
        `UPDATE users
         SET current_balance = current_balance - $1
         WHERE wp_user_id = $2`,
        [commission, referrerId]
      );

      await db.query(
        `UPDATE referrals
         SET total_earned_from_referee = total_earned_from_referee - $1
         WHERE referee_wp_id = $2`,
        [commission, wp_user_id]
      );
    }

    // 5. Reset conversions
    await db.query(
      `UPDATE conversions
       SET payout_status = 'pending',
           actual_paid_amount = NULL,
           log_id = NULL,
           release_date = NULL
       WHERE log_id = $1`,
      [log_id]
    );

    // 6. Mark log reverted
    await db.query(
      "UPDATE balance_logs SET status = 'reverted' WHERE id = $1",
      [log_id]
    );

    // 7. FINAL HARD SYNC (VERY IMPORTANT)
    await db.query(
      `UPDATE users u
       SET current_balance = uw.affiliate_balance
       FROM user_wallets uw
       WHERE u.wp_user_id = uw.wp_user_id
         AND u.wp_user_id = $1`,
      [wp_user_id]
    );

    // ✅ CREATE REVERSAL LOG ENTRY
const prevBalRes = await db.query(
  `SELECT affiliate_balance FROM user_wallets WHERE wp_user_id = $1`,
  [wp_user_id]
);

const newBalAfterRevert = parseFloat(prevBalRes.rows[0].affiliate_balance || 0);
const previousBalanceBeforeRevert = newBalAfterRevert + amountToReverse;

await db.query(
  `INSERT INTO balance_logs (
    wp_user_id,
    amount_changed,
    previous_balance,
    new_balance,
    action_type,
    reason,
    wallet_type,
    status
  )
  VALUES ($1, $2, $3, $4, 'reversal', $5, 'affiliate', 'active')`,
  [
    wp_user_id,
    -amountToReverse,                     // 🔴 NEGATIVE ENTRY
    previousBalanceBeforeRevert,
    newBalAfterRevert,
    'Reversal of previous settlement'
  ]
);

    await db.query("COMMIT");

    res.json({
      success: true,
      message: "Settlement reverted successfully"
    });

  } catch (error) {
    await db.query("ROLLBACK");
    console.error("Revert Error:", error.message);
    res.status(500).json({ error: error.message });
  }
};

// ✅ USER ACTIVITY (ALREADY CORRECT)
export const getUserActivity = async (req, res) => {
  const { id } = req.params;

  try {
    const clicks = await db.query(
      `SELECT clickid, ip_address, created_at 
       FROM click_tracking 
       WHERE wp_user_id = $1 
       ORDER BY created_at DESC LIMIT 50`,
      [id]
    );

    const conversions = await db.query(
      `SELECT c.*, ct.clickid 
       FROM conversions c
       JOIN click_tracking ct ON c.click_id = ct.id
       WHERE ct.wp_user_id = $1
       ORDER BY c.created_at DESC`,
      [id]
    );

    const logs = await db.query(
      `SELECT * FROM balance_logs 
       WHERE wp_user_id = $1 
       ORDER BY created_at DESC`,
      [id]
    );

    const wallet = await db.query(
      `SELECT * FROM user_wallets WHERE wp_user_id = $1`,
      [id]
    );

    res.json({
      clicks: clicks.rows,
      conversions: conversions.rows,
      logs: logs.rows,
      wallet: wallet.rows[0] || {}
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};