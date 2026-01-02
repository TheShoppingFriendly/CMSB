import db from "../db.js"; // Go up one level to reach db.js

export const getPublicUserStats = async (req, res) => {
    const { wp_user_id } = req.params;
    const apiKey = req.headers['x-api-key'];

    try {
        // 1. SECURITY: Check API Key against environment variable
        // Make sure you have BACKEND_API_KEY in your Render Env Variables
        if (!apiKey || apiKey !== process.env.BACKEND_API_KEY) {
            return res.status(403).json({ error: "Access denied. Invalid API Key." });
        }

        // 2. VALIDATION: Ensure wp_user_id is a number
        const userId = parseInt(wp_user_id);
        if (isNaN(userId)) {
            return res.status(400).json({ error: "Invalid User ID format." });
        }

        // 3. FETCH CURRENT BALANCE
        const userRes = await db.query(
            "SELECT current_balance FROM users WHERE wp_user_id = $1", 
            [userId]
        );

        if (userRes.rows.length === 0) {
            return res.status(404).json({ error: "User profile not found in database." });
        }

        const totalBalance = parseFloat(userRes.rows[0].current_balance || 0);

        // 4. CALCULATE LOCKED AMOUNT (Approved, but release_date is in the future)
        const lockedRes = await db.query(
            `SELECT SUM(actual_paid_amount) as locked 
             FROM conversions 
             WHERE payout_status = 'approved' 
             AND release_date > NOW() 
             AND log_id IS NOT NULL
             AND click_id IN (SELECT id FROM click_tracking WHERE wp_user_id = $1)`,
            [userId]
        );
        const lockedAmount = parseFloat(lockedRes.rows[0].locked || 0);

        // 5. CALCULATE PENDING AMOUNT (Tracked but not yet approved)
        const pendingRes = await db.query(
            `SELECT SUM(payout) as pending 
             FROM conversions 
             WHERE payout_status = 'pending'
             AND click_id IN (SELECT id FROM click_tracking WHERE wp_user_id = $1)`,
            [userId]
        );
        const pendingAmount = parseFloat(pendingRes.rows[0].pending || 0);

        // 6. GET TRANSACTION HISTORY (Limited to last 10 for performance)
        const logsRes = await db.query(
            `SELECT amount_changed, reason, status, created_at 
             FROM balance_logs 
             WHERE wp_user_id = $1 
             ORDER BY created_at DESC 
             LIMIT 10`,
            [userId]
        );

        // 7. RESPOND WITH SECURE DATA
        res.json({
            balances: {
                available: (totalBalance - lockedAmount).toFixed(2),
                locked: lockedAmount.toFixed(2),
                pending: pendingAmount.toFixed(2),
                total: totalBalance.toFixed(2)
            },
            history: logsRes.rows
        });

    } catch (error) {
        console.error("Public Stats Error:", error.message);
        res.status(500).json({ error: "Internal Server Error" });
    }
};