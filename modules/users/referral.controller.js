import db from "../../db.js";

/**
 * Fetches the list of referees for a specific referrer
 * GET /api/referrals/my-list?wp_user_id=XXX
 */
export const getMyReferrals = async (req, res) => {
    const { wp_user_id } = req.query;

    if (!wp_user_id) {
        return res.status(400).json({ success: false, message: "Missing wp_user_id" });
    }

    try {
        const result = await db.query(
            `SELECT 
                referee_wp_id, 
                status, 
                created_at, 
                total_earned_from_referee 
             FROM referrals 
             WHERE referrer_wp_id = $1 
             ORDER BY created_at DESC`,
            [wp_user_id]
        );

        res.json({ 
            success: true, 
            data: result.rows 
        });
    } catch (err) {
        console.error("❌ Error fetching referral list:", err);
        res.status(500).json({ success: false, error: "Internal Server Error" });
    }
};