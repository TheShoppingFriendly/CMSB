// controllers/pixelController.js
import db from "../db.js";

export const handlePixelConversion = async (req, res) => {
  try {
    const data = req.method === "GET" ? req.query : req.body;

    const clickid = data.clickid;
    const orderId = data.order_id || data.orderid || null;

    if (!clickid || !orderId) {
      return res.status(400).send("Missing clickid or order_id");
    }

    const saleAmount = Number(
      data.amount || data.sale_amount || data.total || 0
    );

    const commission = Number(data.payout || 0); // usually 0 for pixel

    const clickResult = await db.query(
      "SELECT id FROM click_tracking WHERE clickid = $1 LIMIT 1",
      [clickid]
    );

    if (!clickResult.rows.length) {
      return res.status(404).send("Invalid clickid");
    }

    const click_row_id = clickResult.rows[0].id;
    const payload = JSON.stringify(data);

    await db.query(
      `
      INSERT INTO conversions
      (clickid, click_id, payout, commission, order_id, postback_payload, source)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      `,
      [
        clickid,
        click_row_id,
        saleAmount,     // total sale
        commission,     // commission (mostly 0)
        orderId,
        payload,
        "pixel"
      ]
    );

    return res.status(200).send("OK");
  } catch (err) {
    console.error("Pixel Error:", err);
    return res.status(500).send("Server error");
  }
};
