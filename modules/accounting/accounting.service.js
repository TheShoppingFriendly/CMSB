import db from "../../db.js";

/**
 * Records every financial movement in the system.
 * Designed to be "Atomic" - it either works 100% or not at all.
 */
export const recordAccountingEntry = async ({
    type, adminId = null, userId = null, storeId = null, 
    convId = null, debit = 0, credit = 0, note = ""
}) => {
    const client = await db.connect();
    try {
        await client.query('BEGIN');

        // Calculate total historical profit to create a snapshot
        const totalProfitRes = await client.query(
            "SELECT COALESCE(SUM(credit - debit), 0) as total FROM global_finance_ledger"
        );
        const currentTotal = parseFloat(totalProfitRes.rows[0].total);
        const newSnapshot = (currentTotal + (parseFloat(credit) - parseFloat(debit))).toFixed(2);

        // Insert the audit record
        await client.query(
            `INSERT INTO global_finance_ledger 
            (transaction_type, admin_id, wp_user_id, store_id, ref_id, debit, credit, system_profit_snapshot, note) 
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
            [type, adminId, userId, storeId, convId, debit, credit, newSnapshot, note]
        );

        await client.query('COMMIT');
        return true;
    } catch (e) {
        await client.query('ROLLBACK');
        console.error("CRITICAL ACCOUNTING ERROR:", e.message);
        return false;
    } finally {
        client.release();
    }
};