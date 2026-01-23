import db from "../db.js";
import { finance } from "../modules/finance/finance.engine.js";

export async function getOverview(req, res) {
  try {
    // 1. Total Profit (Sum of all time)
    const profitResult = await db.query(`
      SELECT COALESCE(SUM(credit - debit), 0) AS profit
      FROM global_finance_ledger
    `);

    // 2. Today's Stats
    const todayResult = await db.query(`
      SELECT 
        COUNT(*) AS tx_count,
        COALESCE(SUM(credit - debit), 0) AS total
      FROM global_finance_ledger
      WHERE created_at::date = CURRENT_DATE
    `);

    // 3. Category Breakdown (Required by your frontend modal)
    const breakdownResult = await db.query(`
      SELECT 
        finance_category,
        COUNT(*) as count,
        COALESCE(SUM(credit), 0) as credits,
        COALESCE(SUM(debit), 0) as debits
      FROM global_finance_ledger
      GROUP BY finance_category
    `);

    res.json({
      system_profit: parseFloat(profitResult.rows[0].profit),
      today: {
        tx_count: parseInt(todayResult.rows[0].tx_count),
        total: parseFloat(todayResult.rows[0].total)
      },
      breakdown: breakdownResult.rows // This fixes the frontend "null" issue
    });
  } catch (err) {
    console.error("Finance overview error:", err);
    res.status(500).json({ message: "Failed to load finance overview" });
  }
}

export async function getLedger(req, res) {
  const { limit = 20, offset = 0 } = req.query;

  try {
    const result = await db.query(`
      SELECT
        id,
        created_at,
        transaction_type,
        finance_category,
        credit,
        debit,
        note,
        wp_user_id,
        store_id,
        entity_type,
        entity_id
      FROM global_finance_ledger
      ORDER BY created_at DESC
      LIMIT $1 OFFSET $2
    `, [limit, offset]);

    res.json(result.rows);
  } catch (err) {
    console.error("Ledger error:", err);
    res.status(500).json({ message: "Failed to load ledger" });
  }
}


export async function getJourney(req, res) {
  const { id } = req.params;

  try {
    const result = await db.query(`
      SELECT *
      FROM global_finance_ledger
      WHERE
        entity_id = $1
        OR wp_user_id = CASE WHEN $1 ~ '^[0-9]+$' THEN $1::integer ELSE NULL END
      ORDER BY created_at ASC
    `, [String(id)]);

    res.json(result.rows);
  } catch (err) {
    console.error("Journey lookup failed:", err);
    res.status(500).json({ message: "Journey lookup failed" });
  }
}
export async function getWallet(req, res) {
  const { wpUserId } = req.params;

  const wallet = await db.query(
    `SELECT * FROM user_wallets WHERE wp_user_id = $1`,
    [wpUserId]
  );

  const ledger = await db.query(
    `
    SELECT *
    FROM global_finance_ledger
    WHERE wp_user_id = $1
    ORDER BY created_at DESC
    LIMIT 100
    `,
    [wpUserId]
  );

  res.json({
    wallet: wallet.rows[0],
    ledger: ledger.rows
  });
}

export async function approvePayout(req, res) {
  const { wpUserId, amount, conversionId } = req.body;

  await finance.record({
    action: "PAYOUT_APPROVED",
    amount,
    wpUserId,
    adminId: req.user.id,
    entityType: "CONVERSION",
    entityId: conversionId,
    note: "Admin approved payout"
  });

  res.json({ success: true });
}

export async function markPayoutSent(req, res) {
  const { wpUserId, amount, bankRef } = req.body;

  await finance.record({
    action: "PAYOUT_SENT",
    amount,
    wpUserId,
    adminId: req.user.id,
    entityType: "BANK",
    entityId: bankRef,
    note: "Payout marked as sent"
  });

  res.json({ success: true });
}

export async function manualAdjustment(req, res) {
  const { wpUserId, amount, reason } = req.body;

  await finance.record({
    action: "ADMIN_ADJUSTMENT",
    amount,
    wpUserId,
    adminId: req.user.id,
    entityType: "ADMIN",
    entityId: req.user.id,
    note: reason
  });

  res.json({ success: true });
}
