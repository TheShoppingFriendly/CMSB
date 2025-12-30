import db from "../../db.js";

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

export const getStoresForAdmin = async (req, res) => {
  try {
    const result = await db.query(`
      SELECT
        s.id,
        s.name,
        s.slug,
        -- Use 'payout' as total_sales and 'commission' as total_commission
        COALESCE(SUM(c.payout), 0) AS total_sales,
        COALESCE(SUM(c.commission), 0) AS total_commission
      FROM stores s
      LEFT JOIN click_tracking ct ON ct.campaign_id = s.id
      -- Your schema shows 'click_id' is an integer, so no casting needed if ct.id is also integer
      LEFT JOIN conversions c ON c.click_id = ct.id
      GROUP BY s.id, s.name, s.slug
      ORDER BY s.name
    `);

    res.json(result.rows);
  } catch (error) {
    console.error("SQL Error:", error.message);
    res.status(500).json({ error: error.message });
  }
};
