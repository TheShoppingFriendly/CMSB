import db from "../../db";

export const recordAccountingEntry = async ({
  type,
  adminId = null,
  userId = null,
  storeId = null,
  refId = null,
  credit = 0,
  debit = 0,
  note = ''
}) => {
  try {
    // 1. Get the current total system profit to create a snapshot
    const lastSnapshot = await db.query(
      "SELECT COALESCE(SUM(credit - debit), 0) as total FROM global_finance_ledger"
    );
    
    const newSnapshot = Number(lastSnapshot.rows[0].total) + (Number(credit) - Number(debit));

    // 2. Insert into global_finance_ledger using your specific table structure
    await db.query(
      `INSERT INTO global_finance_ledger 
      (transaction_type, admin_id, wp_user_id, store_id, ref_id, debit, credit, system_profit_snapshot, note) 
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [type, adminId, userId, storeId, refId, debit, credit, newSnapshot, note]
    );
    
    return true;
  } catch (err) {
    console.error("Ledger Record Error:", err);
    return false;
  }
};