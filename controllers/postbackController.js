// controllers/postbackController.js
import db from "../db.js";
import { recordAccountingEntry } from "../modules/accounting/accounting.service.js";

export const handlePostback = async (req, res) => {
  try {
    const data = req.method === "GET" ? req.query : req.body;

    // Resolve Click ID (multiple alias support)
    const clickid =
      data.clickid ||
      data.click_id ||
      data.cid ||
      data.sub_id ||
      data.sid ||
      data.SID ||
      data.subid;

    // Optional: also accept order ID
    const orderId =
      data.order_id ||
      data.transaction_id ||
      data.txn_id ||
      data.orderid ||
      null;

       // ✅ FINAL MAPPING
    const saleAmount = Number(
      data.amount || data.sale_amount || data.total || 0
    );

    const commission = Number(data.payout || data.commission || 0);
    const status = data.status || "approved";

    // const payout = data.payout || data.amount || 0;
    // const status = data.status || "approved";

    if (!clickid) {
      return res.status(400).send("Missing clickid");
    }

    // Fetch click record
 const clickResult = await db.query(
      "SELECT id, campaign_id, wp_user_id FROM click_tracking WHERE clickid = $1 LIMIT 1",
      [clickid]
    );

    if (!clickResult.rows.length) {
      console.warn("Invalid clickid received:", clickid);
      return res.status(404).send("Invalid clickid");
    }

    const click_row_id = clickResult.rows[0].id;
    const campaign_id = clickResult.rows[0].campaign_id; // Now defined!
    const wp_user_id = clickResult.rows[0].wp_user_id;

    // ------------------------------------------
    // #1: De-dup by ORDER ID  
    // ------------------------------------------
    if (orderId) {
      const orderCheck = await db.query(
        "SELECT id FROM conversions WHERE order_id = $1 LIMIT 1",
        [orderId]
      );

      if (orderCheck.rows.length > 0) {
        console.warn("Duplicate ORDER detected:", orderId);
        return res.status(200).send("OK (duplicate order ignored)");
      }
    }

    // ------------------------------------------
    // #2: De-dup by CLICK ID
    // ------------------------------------------
    const clickCheck = await db.query(
      "SELECT id FROM conversions WHERE clickid = $1 LIMIT 1",
      [clickid]
    );

    if (clickCheck.rows.length > 0) {
      console.warn("Duplicate CLICKID detected:", clickid);
      return res.status(200).send("OK (duplicate click ignored)");
    }

    // ------------------------------------------
    // Insert conversion
    // ------------------------------------------
    const payload = JSON.stringify(data);

    await db.query(
    `
      INSERT INTO conversions
      (clickid, click_id, payout, commission, status, order_id, postback_payload)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      `,
      [
        clickid,
        click_row_id,
        saleAmount,     // ✅ total sale
        commission,     // ✅ your commission
        status,
        orderId,
        payload
      ]
    );


    await recordAccountingEntry({
        type: 'INCOMING_REVENUE',
        storeId: campaign_id, 
        userId: wp_user_id,
        credit: commission, 
        note: `Revenue: Postback for Order ${orderId || 'N/A'}`
    });

    return res.status(200).send("OK");
  } catch (err) {
    console.error("ERROR handlePostback:", err);
    return res.status(500).send("Server error");
  }
};


