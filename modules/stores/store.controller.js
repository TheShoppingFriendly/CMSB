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
    /** 1️⃣ Fetch store */
    const storeResult = await db.query(
      `SELECT id, name, slug, status FROM stores WHERE slug = $1`,
      [slug]
    );

    if (storeResult.rowCount === 0) {
      return res.status(404).json({ error: "Store not found" });
    }

    const store = storeResult.rows[0];

    /** 2️⃣ Fetch campaigns for this store */
    const campaignResult = await db.query(
      `
      SELECT id, title
      FROM campaigns
      WHERE store_id = $1
      `,
      [store.id]
    );

    const campaignIds = campaignResult.rows.map(c => c.id);

    if (campaignIds.length === 0) {
      return res.status(200).json({
        store,
        campaigns: [],
        conversions: [],
        totalRevenue: 0
      });
    }

    /** 3️⃣ Fetch conversions */
    const conversionsResult = await db.query(
      `
      SELECT 
        id,
        campaign_id,
        order_id,
        amount,
        commission,
        status,
        created_at
      FROM conversions
      WHERE campaign_id = ANY($1)
      ORDER BY created_at DESC
      `,
      [campaignIds]
    );

    /** 4️⃣ Total revenue */
    const revenueResult = await db.query(
      `
      SELECT COALESCE(SUM(commission), 0) AS total_revenue
      FROM conversions
      WHERE campaign_id = ANY($1)
      `,
      [campaignIds]
    );

    return res.status(200).json({
      store,
      campaigns: campaignResult.rows,
      conversions: conversionsResult.rows,
      totalRevenue: Number(revenueResult.rows[0].total_revenue)
    });

  } catch (error) {
    console.error("Campaign Fetch Error:", error);
    return res.status(500).json({ error: "Failed to fetch campaign data" });
  }
};

