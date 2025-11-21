// controllers/clickController.js
import db from "../db.js"; 
import { generateSubId } from "../utils/subid.js";

// Generate clickid + track click
export const generateSubIdAndTrack = async (req, res) => {
  try {
    const { wp_user_id, coupon_url, campaign_id } = req.body;

    if (!coupon_url) {
      return res.status(400).json({ success: false, message: "coupon_url is required" });
    }

    const wpUserId = wp_user_id ? Number(wp_user_id) : null;
    const campaignId = campaign_id ? Number(campaign_id) : null;

    // OLD: sub_id → NEW: clickid
    const clickid = generateSubId();

    // Append clickid to outbound URL
    const separator = coupon_url.includes("?") ? "&" : "?";
    const final_url = `${coupon_url}${separator}clickid=${encodeURIComponent(clickid)}`;

    // Get IP + user-agent
    const ip_address =
      (req.headers["x-forwarded-for"] || "").split(",").shift().trim() ||
      req.socket.remoteAddress ||
      null;

    const user_agent = req.headers["user-agent"] || null;

    const sql = `
      INSERT INTO click_tracking
        (wp_user_id, campaign_id, clickid, coupon_url, final_redirect_url, ip_address, user_agent)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id
    `;

    const { rows } = await db.query(sql, [
      wpUserId,
      campaignId,
      clickid,
      coupon_url,
      final_url,
      ip_address,
      user_agent,
    ]);

    return res.status(201).json({
      success: true,
      clickid,        // renamed
      final_url,
      click_row_id: rows[0]?.id || null,
    });
  } catch (err) {
    console.error("ERROR generateSubIdAndTrack:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

// Debug route to fetch click by clickid
export const getClickByClickid = async (req, res) => {
  try {
    const { clickid } = req.params;
    if (!clickid)
      return res.status(400).json({ success: false, message: "clickid is required" });

    const { rows } = await db.query(
      "SELECT * FROM click_tracking WHERE clickid = $1 LIMIT 1",
      [clickid]
    );

    if (!rows.length)
      return res.status(404).json({ success: false, message: "Not found" });

    return res.json({ success: true, click: rows[0] });
  } catch (err) {
    console.error("ERROR getClickByClickid:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};
