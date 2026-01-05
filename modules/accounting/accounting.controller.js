import db from "../../db.js";

export const getAccountingReport = async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        let query = `SELECT * FROM global_finance_ledger WHERE 1=1`;
        const params = [];

        if (startDate && endDate) {
            query += ` AND created_at BETWEEN $1 AND $2`;
            params.push(startDate, endDate);
        }

        query += ` ORDER BY created_at DESC`;

        const result = await db.query(query, params);
        
        // System Health Stats - Adding COALESCE to prevent NULL errors
        const stats = await db.query(
            `SELECT 
                COALESCE(SUM(credit), 0) as total_revenue, 
                COALESCE(SUM(debit), 0) as total_liabilities, 
                COALESCE(SUM(credit - debit), 0) as net_profit 
             FROM global_finance_ledger`
        );

        res.json({
            summary: stats.rows[0] || { total_revenue: 0, total_liabilities: 0, net_profit: 0 },
            logs: result.rows || []
        });
    } catch (err) {
        console.error("FINANCE ERROR:", err); // This shows the EXACT error in your Render logs
        res.status(500).json({ error: "Finance Report Error" });
    }
};