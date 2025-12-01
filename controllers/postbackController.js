// controllers/postbackController.js
import db from "../db.js";

export const handlePostback = async (req, res) => {
  try {
    // Accept GET or POST for flexibility
    const data = req.method === "GET" ? req.query : req.body;

    // Accept multiple aliases (networks send different param names)
    const clickid =
<<<<<<< HEAD
      data.clickid || data.click_id || data.cid || data.sub_id || data.sid || data.SID || data.subid;
=======
      data.clickid || data.click_id || data.cid || data.sub_id || data.sid || data.SID || data.subid ;
>>>>>>> 6fa3d1dab40ebd9a43afec99c8ab2aca6731de10

    const payout = data.payout || data.amount || 0;
    const status = data.status || "approved"; // default for testing

    if (!clickid) {
      return res.status(400).send("Missing clickid");
    }

    // find click record
    const clickResult = await db.query(
      "SELECT id, wp_user_id FROM click_tracking WHERE clickid = $1 LIMIT 1",
      [clickid]
    );

    if (!clickResult.rows.length) {
      console.warn("Invalid clickid received in postback:", clickid); 
      return res.status(404).send("Invalid clickid");
    }

    const click_row_id = clickResult.rows[0].id;
    const payload = JSON.stringify(data);

    const insertSql = `
      INSERT INTO conversions 
      (clickid, click_id, payout, status, postback_payload)
      VALUES ($1, $2, $3, $4, $5)
    `;

    await db.query(insertSql, [
      clickid,
      click_row_id,
      payout || 0,
      status,
      payload,
    ]);

    return res.send("OK");
  } catch (err) {
    console.error("ERROR handlePostback:", err);
    return res.status(500).send("Server error");
  }
};
