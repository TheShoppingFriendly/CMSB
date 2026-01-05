import db from "../../db.js";

export const getAccountingReport = async (req, res) => {
    try {
        const { startDate, endDate, type } = req.query;
        let query = `
            SELECT l.*, u.username as user_name, s.name as store_name, a.username as admin_name
            FROM global_finance_ledger l
            LEFT JOIN users u ON l.wp_user_id = u.wp_user_id
            LEFT JOIN stores s ON l.store_id = s.id
            LEFT JOIN admin_users a ON l.admin_id = a.id
            WHERE 1=1
        `;
        const params = [];

        if (startDate && endDate) {
            query += ` AND l.created_at BETWEEN $${params.length + 1} AND $${params.length + 2}`;
            params.push(startDate, endDate);
        }

        query += ` ORDER BY l.created_at DESC`;

        const result = await db.query(query, params);
        
        // System Health Stats
        const stats = await db.query(
            "SELECT SUM(credit) as total_revenue, SUM(debit) as total_liabilities, SUM(credit - debit) as net_profit FROM global_finance_ledger"
        );

        res.json({
            summary: stats.rows[0],
            logs: result.rows
        });
    } catch (err) {
        res.status(500).json({ error: "Finance Report Error" });
    }
};