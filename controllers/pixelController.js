// controllers/pixelController.js
import db from "../db.js";

export const handlePixelConversion = async (req, res) => {
    try {
        const data = req.method === "GET" ? req.query : req.body;

        // 1. Resolve Click ID from URL (using a simple alias since the pixel only sends 'clickid')
        const clickid = data.clickid; 
        const orderId = data.order_id || data.orderid || null;
        
        // Map incoming 'amount' to the DB column 'payout'
        const payout = data.amount || data.payout || 0; 
        
        // Status is NOT sent by the pixel, so we must dynamically use the DB default or a reliable value.
        // We will omit 'status' from the INSERT statement to use the DB default ('pending').
        
        if (!clickid || !orderId) { 
             return res.status(400).send("Missing clickid or order_id");
        }

        // --- DYNAMIC LOOKUP (COPIED FROM POSTBACK) ---
        // Fetch click record to get the required integer ID for click_id column
        const clickResult = await db.query(
            "SELECT id FROM click_tracking WHERE clickid = $1 LIMIT 1",
            [clickid]
        );

        if (!clickResult.rows.length) {
            console.warn("Invalid clickid received (No click_tracking record):", clickid);
            // If the ClickID doesn't exist, we can't log the conversion.
            return res.status(404).send("Invalid clickid");
        }

        const click_row_id = clickResult.rows[0].id; // <--- THE DYNAMIC INTEGER
        // ------------------------------------------

        // 2. Insert conversion (using the dynamically fetched click_row_id)
        // Note: We omit 'status' to use the DB default ('pending').
        const payload = JSON.stringify(data);

        await db.query(
            `
            INSERT INTO public.conversions 
            (clickid, click_id, payout, order_id, postback_payload, source)
            VALUES ($1, $2, $3, $4, $5, $6)
            `,
            [
                clickid,        // $1: clickid (char varying) - Tracking String
                click_row_id,   // $2: click_id (integer) - Dynamically fetched integer ID
                payout,         // $3: payout (numeric) - Sale Amount
                orderId,        // $4: order_id (text)
                payload,        // $5: postback_payload (text)
                'pixel'         // $6: source (char varying) - Hardcoded only because the pixel doesn't send it.
            ]
        );

        // Success: Status 200 is appropriate for a successful pixel fire.
        return res.status(200).send("OK"); 

    } catch (err) {
        console.error("ERROR handlePixelConversion:", err);
        return res.status(500).send("Server error");
    }
};