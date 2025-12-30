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
        COALESCE(SUM(c.payout), 0) AS total_sales,
        COALESCE(SUM(c.commission), 0) AS total_commission
      FROM stores s
      -- LEFT JOIN ensures stores show up even with 0 clicks
      LEFT JOIN click_tracking ct ON ct.campaign_id = s.id
      -- LEFT JOIN ensures stores show up even with 0 conversions
      LEFT JOIN conversions c ON c.click_id = ct.id
      GROUP BY s.id, s.name, s.slug
      ORDER BY s.name ASC
    `);

    // Log the count to your Render console for debugging
    console.log(`Found ${result.rows.length} stores in DB`);

    // Force a 200 OK status to avoid the 204 No Content issue
    return res.status(200).json(result.rows);
  } catch (error) {
    console.error("SQL Error:", error.message);
    res.status(500).json({ error: error.message });
  }
};
