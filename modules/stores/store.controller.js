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
    INSERT INTO stores 
    (id, name, slug, status, about, image, store_link, external_store_id, additional_info)
    VALUES ($1, $2, $3, true, $4, $5, $6, $7, $8)
    ON CONFLICT (id)
    DO UPDATE SET
      name = EXCLUDED.name,
      slug = EXCLUDED.slug,
      about = EXCLUDED.about,
      image = EXCLUDED.image,
      store_link = EXCLUDED.store_link,
      external_store_id = EXCLUDED.external_store_id,
      additional_info = EXCLUDED.additional_info,
      synced_at = NOW()
  `;

  try {
    for (const store of stores) {
      await db.query(query, [
        store.id,
        store.name,
        store.slug,
        store.about || null,
        store.image || null,
        store.store_link || null,
        store.external_store_id || null,
        store.additional_info || null
      ]);
    }

    res.json({ success: true });
  } catch (err) {
    console.error("Sync Error:", err.message);
    res.status(500).json({ error: "Failed to sync stores" });
  }
};

/**
 * Admin CMS → Get all stores
 */
export const getStoresForAdmin = async (req, res) => {
  try {
  const result = await db.query(`
  SELECT 
    id, 
    name, 
    slug, 
    status,
    about,
    image,
    store_link,
    external_store_id
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
    /* 1️⃣ Get store */
   const storeRes = await db.query(
  `
  SELECT 
    id,
    name,
    slug,
    status,
    about,
    image,
    store_link,
    additional_info
  FROM stores 
  WHERE slug = $1
  `,
  [slug]
);

    if (storeRes.rowCount === 0) {
      return res.status(404).json({ error: "Store not found" });
    }

    const store = storeRes.rows[0];

    /* 2️⃣ Get conversions via click_tracking */
    const conversionsRes = await db.query(
      `
   SELECT 
  c.id,
  c.clickid,
  c.order_id,
  c.payout,
  c.commission,
  c.status,
  c.created_at
FROM conversions c
JOIN click_tracking ct 
  ON ct.id = c.click_id
WHERE ct.campaign_id = $1
ORDER BY c.created_at DESC
      `,
      [store.id]
    );

    /* 3️⃣ Total commission */
    const revenueRes = await db.query(
      `
      SELECT COALESCE(SUM(c.commission), 0) AS total_revenue
      FROM conversions c
      JOIN click_tracking ct 
        ON ct.id = c.click_id
      WHERE ct.campaign_id = $1
      `,
      [store.id]
    );

    return res.status(200).json({
      store,
      conversions: conversionsRes.rows,
      totalRevenue: Number(revenueRes.rows[0].total_revenue),
    });

  } catch (err) {
    console.error("Campaign Fetch Error:", err.message);
    res.status(500).json({ error: "Failed to fetch campaign data" });
  }
};

