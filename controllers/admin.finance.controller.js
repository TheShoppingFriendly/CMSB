import db from "../db.js";
import { finance } from "../modules/finance/finance.engine.js";

export const getOverview = async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        COALESCE(
          (
            SELECT system_profit_snapshot
            FROM global_finance_ledger
            ORDER BY created_at DESC
            LIMIT 1
          ),
          0
        ) AS system_profit
    `);

    const profit = Number(rows[0].system_profit) || 0;

    res.json({
      system_profit: profit,
      today: {
        tx_count: 0,
        total: 0
      }
    });
  } catch (err) {
    console.error("Overview error:", err);
    res.status(500).json({ message: "Failed to load overview" });
  }
};


export async function getLedger(req, res) {
  const {
    user,
    store,
    type,
    from,
    to,
    page = 1,
    limit = 50
  } = req.query;

  let filters = [];
  let values = [];
  let i = 1;

  if (user) {
    filters.push(`wp_user_id = $${i++}`);
    values.push(user);
  }
  if (store) {
    filters.push(`store_id = $${i++}`);
    values.push(store);
  }
  if (type) {
    filters.push(`transaction_type = $${i++}`);
    values.push(type);
  }
  if (from) {
    filters.push(`created_at >= $${i++}`);
    values.push(from);
  }
  if (to) {
    filters.push(`created_at <= $${i++}`);
    values.push(to);
  }

  const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
  const offset = (page - 1) * limit;

  const result = await db.query(
    `
    SELECT *
    FROM global_finance_ledger
    ${where}
    ORDER BY created_at DESC
    LIMIT $${i++} OFFSET $${i++}
    `,
    [...values, limit, offset]
  );

  res.json(result.rows);
}

export async function getJourney(req, res) {
  const { id } = req.params;

  const result = await db.query(
    `
    SELECT *
    FROM global_finance_ledger
    WHERE journey_id = $1
    ORDER BY created_at ASC
    `,
    [id]
  );

  res.json(result.rows);
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
