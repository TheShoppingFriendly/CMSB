import db from "../db.js";

export const handlePixelConversion = async (req, res) => {
  try {
    const data = req.method === "GET" ? req.query : req.body;

    const clickid = data.clickid || data.subid;
    const order_id = data.order_id || data.orderid;
    const amount = data.amount || data.sale_amount || 0;
    const campaign = data.campaign || null;

    if (!clickid || !order_id) {
      return res.status(400).json({
        success: false,
        message: "Missing clickid or order_id"
      });
    }

    // Insert conversion
    const sql = `
      INSERT INTO conversions (clickid, order_id, amount, campaign, source_type)
      VALUES (?, ?, ?, ?, 'pixel')
    `;

    await db.query(sql, [clickid, order_id, amount, campaign]);

    return res.json({
      success: true,
      message: "Pixel conversion logged successfully"
    });

  } catch (err) {
    console.error("Pixel error:", err);
    return res.status(500).json({
      success: false,
      message: "Internal server error"
    });
  }
};
