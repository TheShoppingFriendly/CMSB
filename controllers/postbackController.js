// controllers/postbackController.js
import db from "../db.js";
 
// ----------------------------------------------------------------------
// UNIVERSAL TEST DETECTOR (Trackier-standard)
// ----------------------------------------------------------------------
function isTestRequest(clickid, data) {
  const cid = String(clickid || "").toUpperCase();
 
  return (
    data.test === "1" ||
    data.isTest === "true" ||
    cid.includes("TEST") ||
    cid.startsWith("TST") ||
    cid.startsWith("TRK_") ||
    cid.startsWith("PREVIEW") ||
    /^[A-Z0-9]{5,12}_[0-9]{6}$/.test(cid) // Cuelinks test: ABC12_240424
  );
}
 
// ----------------------------------------------------------------------
// MAIN POSTBACK HANDLER
// ----------------------------------------------------------------------
export const handlePostback = async (req, res) => {
  try {
    const data = req.method === "GET" ? req.query : req.body;
 
    // Accept all possible affiliate network parameters
    const clickid =
      data.clickid ||
      data.click_id ||
      data.cid ||
      data.subid ||
      data.sub_id ||
      data.sid ||
      data.SID ||
      data.aff_sub ||
      data.aff_sub1 ||
      data.aff_sub2;
 
    const payout = Number(data.payout || data.amount || data.sale_amount || 0);
    const status = data.status || data.conversion_status || "approved";
 
    // Missing clickid
    if (!clickid) {
      return res.status(400).send("Missing clickid");
    }
 
    // Check if click exists in the system
    const clickResult = await db.query(
      "SELECT id, wp_user_id FROM click_tracking WHERE clickid = $1 LIMIT 1",
      [clickid]
    );
 
    // ------------------------------------------------------------------
    // TRACKIER BEHAVIOR:
    // INVALID CLICK + TEST MODE → Return 200 OK (external) but DO NOT add conversion
    // ------------------------------------------------------------------
    if (!clickResult.rows.length) {
      if (isTestRequest(clickid, data)) {
        console.warn("TEST MODE: Invalid clickid but returning 200");
        
        // Internal log
        await db.query(
          "INSERT INTO postback_logs (clickid, payload, status) VALUES ($1, $2, $3)",
          [clickid, JSON.stringify(data), "TEST_INVALID_CLICK"]
        );
 
        return res.status(200).send("OK");
      }
 
      // ------------------------------------------------------------------
      // REAL INVALID CLICK → Trackier logs INVALID_CLICK_ID but returns 404
      // ------------------------------------------------------------------
      console.warn("REAL MODE: Invalid clickid:", clickid);
 
      await db.query(
        "INSERT INTO postback_logs (clickid, payload, status) VALUES ($1, $2, $3)",
        [clickid, JSON.stringify(data), "INVALID_CLICK_ID"]
      );
 
      return res.status(404).send("Invalid clickid");
    }
 
    // ------------------------------------------------------------------
    // VALID CLICK ID → Trackier stores conversion
    // ------------------------------------------------------------------
    const click_row_id = clickResult.rows[0].id;
 
    await db.query(
      `INSERT INTO conversions
       (clickid, click_id, payout, status, postback_payload)
       VALUES ($1, $2, $3, $4, $5)`,
      [clickid, click_row_id, payout, status, JSON.stringify(data)]
    );
 
    // INTERNAL LOG
    await db.query(
      "INSERT INTO postback_logs (clickid, payload, status) VALUES ($1, $2, $3)",
      [clickid, JSON.stringify(data), "CONVERSION_RECORDED"]
    );
 
    // EXTERNAL RESPONSE (Trackier-standard)
    return res.status(200).send("OK");
  } catch (err) {
    console.error("ERROR handlePostback:", err);
    return res.status(500).send("Server error");
  }
};