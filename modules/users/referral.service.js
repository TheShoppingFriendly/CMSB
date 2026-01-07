import db from "../../db.js";

/**
 * Handles the linking logic between Referrer and Referee
 * Includes IP-based scam prevention and self-referral checks.
 */
export const linkUsers = async (refereeWpId, refCode, ipAddress) => {
    // 1. Clean up the code input
    const cleanRefCode = refCode ? refCode.trim() : null;
    
    // If no referral code was used, exit silently
    if (!cleanRefCode || cleanRefCode === 'undefined' || cleanRefCode === 'null' || cleanRefCode === '') {
        return;
    }

    try {
        // 2. Find the Referrer (User 1) who owns this code
        const referrerRes = await db.query(
            'SELECT wp_user_id, registration_ip FROM users WHERE referral_code = $1', 
            [cleanRefCode]
        );

        // If the code doesn't exist in our DB, we can't link it
        if (referrerRes.rows.length === 0) {
            console.log(`⚠️ Referral code ${cleanRefCode} not found in database.`);
            return;
        }

        const referrer = referrerRes.rows[0];
        
        // 3. Prevent Self-Referral (User trying to refer themselves)
        if (parseInt(referrer.wp_user_id) === parseInt(refereeWpId)) {
            console.log("❌ Self-referral detected. Skipping link.");
            return;
        }

        /**
         * 4. Scam Prevention: IP Check
         * If the person registering has the same IP as the person who owns the code,
         * we mark it as 'blocked' or 'flagged' to prevent multi-account fraud.
         */
        const status = (referrer.registration_ip === ipAddress) ? 'blocked' : 'pending';

        // 5. Create the relationship in the 'referrals' table
        // ON CONFLICT prevents a user from being referred twice
        await db.query(
            `INSERT INTO referrals (referrer_wp_id, referee_wp_id, referral_code_used, status, registration_ip) 
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (referee_wp_id) DO NOTHING`,
            [referrer.wp_user_id, refereeWpId, cleanRefCode, status, ipAddress]
        );

        // 6. Update the Referee's user record to store who invited them
        await db.query(
            'UPDATE users SET referred_by_wp_id = $1 WHERE wp_user_id = $2 AND referred_by_wp_id IS NULL',
            [referrer.wp_user_id, refereeWpId]
        );

        console.log(`✅ Referral Linked: ${cleanRefCode} -> WP_ID:${refereeWpId} (Status: ${status})`);

    } catch (err) {
        console.error("❌ Referral Linking Error:", err.message);
    }
};