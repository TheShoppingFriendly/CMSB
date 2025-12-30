import db from "../../db.js";

/**
 * WordPress → Backend
 * Sync stores
 */
export const syncStores = async (req, res) => {
  const { stores } = req.body;

  if (!Array.isArray(stores)) {
    return res.status(400).json({ error: "Invalid store payload" });
  }

  const query = `
    INSERT INTO stores (id, name, slug, status)
    VALUES ($1, $2, $3, true)
    ON CONFLICT (id)
    DO UPDATE SET
      name = EXCLUDED.name,
      slug = EXCLUDED.slug,
      synced_at = NOW()
  `;

  for (const store of stores) {
    await db.query(query, [
      store.id,
      store.name,
      store.slug
    ]);
  }

  res.json({ success: true });
};

/**
 * Admin CMS → Get all stores
 */
export const getStoresForAdmin = async (req, res) => {
  try {
    const result = await db.query(`
      SELECT id, name, slug, status 
      FROM stores 
      ORDER BY id DESC
    `);

    return res.status(200).json(result.rows);
  } catch (error) {
    console.error("Fetch Error:", error.message);
    res.status(500).json({ error: error.message });
  }
};

/**
 * 🔥 NEW: Admin CMS → Store Campaign Page
 * GET /api/stores/:slug/campaign
 */
export const getStoreCampaignDetails = async (req, res) => {
  const { slug } = req.params;

  try {
    /** 1️⃣ Get store */
    const storeResult = await db.query(
      `SELECT id, name, slug FROM stores WHERE slug = $1`,
      [slug]
    );

    if (storeResult.rowCount === 0) {
      return res.status(404).json({ error: "Store not found" });
    }

    const store = storeResult.rows[0];

    /** 2️⃣ Get click IDs for this store */
    const clicksResult = await db.query(
      `
      SELECT id
      FROM clicks
      WHERE store_id = $1
      `,
      [store.id]
    );

    const clickIds = clicksResult.rows.map(r => r.id);

    if (clickIds.length === 0) {
      return res.status(200).json({
        store,
        conversions: [],
        totalRevenue: 0
      });
    }

    /** 3️⃣ Fetch conversions via click_id */
    const conversionsResult = await db.query(
      `
      SELECT
        id,
        clickid,
        order_id,
        commission,
        payout,
        status,
        source,
        created_at
      FROM conversions
      WHERE click_id = ANY($1)
      ORDER BY created_at DESC
      `,
      [clickIds]
    );

    /** 4️⃣ Total revenue (commission) */
    const revenueResult = await db.query(
      `
      SELECT COALESCE(SUM(commission), 0) AS total_revenue
      FROM conversions
      WHERE click_id = ANY($1)
      `,
      [clickIds]
    );

    return res.status(200).json({
      store,
      conversions: conversionsResult.rows,
      totalRevenue: Number(revenueResult.rows[0].total_revenue)
    });

  } catch (error) {
    console.error("Campaign Fetch Error:", error.message);
    return res.status(500).json({ error: "Failed to fetch campaign data" });
  }
};

