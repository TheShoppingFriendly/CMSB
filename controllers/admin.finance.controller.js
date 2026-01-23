import db from "../db.js";
import { finance } from "../modules/finance/finance.engine.js";

export async function getOverview(req, res) {
  try {
    // Total Profit (All time)
    const profitRes = await db.query(`
      SELECT COALESCE(SUM(credit - debit), 0)::text AS profit 
      FROM global_finance_ledger
    `);

    // Today's Stats
    const todayRes = await db.query(`
      SELECT 
        COUNT(*)::integer AS tx_count,
        COALESCE(SUM(credit - debit), 0)::text AS total
      FROM global_finance_ledger
      WHERE created_at::date = CURRENT_DATE
    `);

    // Category Breakdown
    const breakdownRes = await db.query(`
      SELECT 
        finance_category,
        COUNT(*)::integer as count,
        COALESCE(SUM(credit), 0)::text as credits,
        COALESCE(SUM(debit), 0)::text as debits
      FROM global_finance_ledger
      GROUP BY finance_category
    `);

    res.json({
      system_profit: parseFloat(profitRes.rows[0].profit || 0),
      today: {
        tx_count: todayRes.rows[0].tx_count,
        total: parseFloat(todayRes.rows[0].total || 0)
      },
      breakdown: breakdownRes.rows.map(row => ({
        finance_category: row.finance_category,
        count: row.count,
        credits: parseFloat(row.credits || 0),
        debits: parseFloat(row.debits || 0)
      }))
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
