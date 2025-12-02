// controllers/postbackController.js
import db from "../db.js";

export const handlePostback = async (req, res) => {
  try {
    // Accept GET or POST for flexibility
    const data = req.method === "GET" ? req.query : req.body;

    // Accept multiple aliases (networks send different param names)
    const clickid =
      data.clickid || data.click_id || data.cid || data.sub_id || data.sid || data.SID || data.subid ;

    const payout = data.payout || data.amount || 0;
    const status = data.status || "approved"; // default for testing

    if (!clickid) {
      return res.status(400).send("Missing clickid");
    }

    // find click record
    // const clickResult = await db.query(
    //   "SELECT id, wp_user_id FROM click_tracking WHERE clickid = $1 LIMIT 1",
    //   [clickid]
    // );

    // if (!clickResult.rows.length) {
    //   console.warn("Invalid clickid received in postback:", clickid); 
    //   return res.status(404).send("Invalid clickid");
    // }

    // find click record
const clickResult = await db.query(
  "SELECT id, wp_user_id FROM click_tracking WHERE clickid = $1 LIMIT 1",
  [clickid]
);
 
if (!clickResult.rows.length) {
  
  // ⭐ TEST MODE FOR CUELINKS / TRACKIER / ALL NETWORKS
  const isTestRequest =
    (data.test && String(data.test) === "1") ||        // ?test=1
    String(clickid).toLowerCase().includes("test") ||  // contains test
    String(clickid).startsWith("CLNK") ||              // Cuelinks patterns
    String(clickid).startsWith("TST") ||               // Some networks
    String(clickid).startsWith("trk_") ||              // Trackier preview
    data.isTest === "true";                            // some send isTest=true
  
  if (isTestRequest) {
    console.warn("TEST MODE postback accepted:", clickid);
    return res.status(200).send("OK - Test Mode Accepted");
  }
 
  // ❌ Not a test → then invalid
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
