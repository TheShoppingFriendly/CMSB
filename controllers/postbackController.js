import db from "../db.js";

export const handlePostback = async (req, res) => {
  try {
    // Accept GET or POST for flexibility
    const data = req.method === "GET" ? req.query : req.body;
    const sub_id = data.sub_id || data.sid || data.SID;
    const payout = data.payout || data.amount || 0;
    const status = data.status || "approved"; // default to 'approved' for testing

    if (!sub_id) {
      return res.status(400).send("Missing sub_id");
    }

    // find click record
    const clickResult = await db.query(
      "SELECT id, wp_user_id FROM click_tracking WHERE sub_id = $1 LIMIT 1",
      [sub_id]
    );

    if (!clickResult.rows.length) {
      console.warn("Invalid sub_id received in postback:", sub_id);
      return res.status(404).send("Invalid sub_id");
    }

    const click_id = clickResult.rows[0].id;

    const payload = JSON.stringify(data);

    const insertSql =
      "INSERT INTO conversions (sub_id, click_id, payout, status, postback_payload) VALUES ($1, $2, $3, $4, $5)";
    await db.query(insertSql, [sub_id, click_id, payout || 0, status, payload]);

    // optionally: you can update click_tracking to mark conversion; table doesn't have status column per your schema
    // e.g. await db.query("UPDATE click_tracking SET converted = 1 WHERE id = $1", [click_id]);

    return res.send("OK");
  } catch (err) {
    console.error("ERROR handlePostback:", err);
    return res.status(500).send("Server error");
  }
};