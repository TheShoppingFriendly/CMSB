import pool from "../../db.js";
import { syncWallet } from "./wallet.sync.js";
import TYPES from "./transaction.types.js";

export async function finance({ 
  action,
  amount,
  wpUserId,
  storeId,
  entityType,
  entityId,
  adminId,
  note
}) {
  const config = TYPES[action];
  if (!config) throw new Error(`Unknown transaction type: ${action}`);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Lock ledger
    const { rows } = await client.query(`
      SELECT system_profit_snapshot
      FROM global_finance_ledger
      ORDER BY created_at DESC
      LIMIT 1
      FOR UPDATE
    `);

    const currentProfit = rows[0]?.system_profit_snapshot || 0;

    let credit = 0;
    let debit = 0;
    let newProfit = currentProfit;

    if (config.category === "REVENUE") {
      credit = amount;
      newProfit += amount;
    }

    if (config.category === "EXPENSE") {
      debit = amount;
      newProfit -= amount;
    }

    const res = await client.query(`
      INSERT INTO global_finance_ledger
      (transaction_type, finance_category, admin_id,
       wp_user_id, store_id, debit, credit,
       system_profit_snapshot, entity_type, entity_id, note)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
      RETURNING id
    `, [
      action,
      config.category,
      adminId || null,
      wpUserId || null,
      storeId || null,
      debit,
      credit,
      newProfit,
      entityType || null,
      entityId || null,
      note || null
    ]);

    await syncWallet(client, wpUserId, config.wallet);

    await client.query("COMMIT");
    return res.rows[0];
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
