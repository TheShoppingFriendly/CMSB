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
        COALESCE(SUM(c.total_sale_amount), 0) AS total_sales,
        COALESCE(SUM(c.commission_amount), 0) AS total_commission
      FROM stores s
      -- First join: campaign_id is now an integer, matches s.id
      LEFT JOIN click_tracking ct ON ct.campaign_id = s.id
      -- Second join: FORCE both sides to text to prevent the 500 error
      LEFT JOIN conversions c ON c.click_id::text = ct.id::text
      GROUP BY s.id, s.name, s.slug
      ORDER BY s.name
    `);

    res.json(result.rows);
  } catch (error) {
    // Check your Render "Logs" tab to see this specific output
    console.error("SQL Execution Error:", error.message);
    res.status(500).json({ error: error.message });
  }
};
