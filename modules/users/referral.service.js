import db from "../../db.js";

/**
 * Generates a unique referral code and ensures it doesn't already exist in DB
 */
export const generateUniqueCode = async (name) => {
    let isUnique = false;
    let newCode = "";

    while (!isUnique) {
        const prefix = (name || "USR").substring(0, 3).toUpperCase();
        const randomStr = Math.random().toString(36).substring(2, 6).toUpperCase();
        newCode = `${prefix}${randomStr}`;

        // Check if code exists (Extra safety)
        const check = await db.query('SELECT id FROM users WHERE referral_code = $1', [newCode]);
        if (check.rows.length === 0) isUnique = true;
    }
    return newCode;
};

/**
 * Handles the linking logic between Referrer and Referee
 */
export const linkUsers = async (refereeWpId, refCode, ipAddress) => {
    // If no referral code was used, just exit silently
    if (!refCode || refCode === 'undefined' || refCode === 'null') return;

    try {
        // 1. Find the Referrer (User 1)
        const referrerRes = await db.query(
            'SELECT wp_user_id, registration_ip FROM users WHERE referral_code = $1', 
            [refCode]
        );

        if (referrerRes.rows.length > 0) {
            const referrer = referrerRes.rows[0];
            
            // 2. Prevent Self-Referral
            if (parseInt(referrer.wp_user_id) === parseInt(refereeWpId)) {
                console.log("Self-referral detected. Skipping link.");
                return;
            }

            // 3. Scam Prevention: Mark as 'blocked' if IPs match
            const status = (referrer.registration_ip === ipAddress) ? 'blocked' : 'pending';

            // 4. Create the relationship (The Referral List entry)
            // Use a transaction-safe approach if possible, or simple queries:
            await db.query(
                `INSERT INTO referrals (referrer_wp_id, referee_wp_id, referral_code_used, status, registration_ip) 
                 VALUES ($1, $2, $3, $4, $5)
                 ON CONFLICT (referee_wp_id) DO NOTHING`, // Safety against double-trigger
                [referrer.wp_user_id, refereeWpId, refCode, status, ipAddress]
            );

            // 5. Update the User 2 record
            await db.query(
                'UPDATE users SET referred_by_wp_id = $1 WHERE wp_user_id = $2',
                [referrer.wp_user_id, refereeWpId]
            );

            console.log(`✅ Referral Linked: ${refCode} -> WP_ID:${refereeWpId} (Status: ${status})`);
        }
    } catch (err) {
        console.error("❌ Referral Linking Error:", err);
    }
};