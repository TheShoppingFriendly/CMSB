import db from "../db.js"; // assumes db is a pg.Pool instance
import { generateSubId } from "../utils/subid.js";

export const generateSubIdAndTrack = async (req, res) => {
  try {
    const { wp_user_id, coupon_url, campaign_id } = req.body;

    if (!coupon_url) {
      return res.status(400).json({ success: false, message: "coupon_url is required" });
    }

    const wpUserId = wp_user_id ? Number(wp_user_id) : null;
    const campaignId = campaign_id ? Number(campaign_id) : null;

    const sub_id = generateSubId();

    // build final redirect URL by appending sub_id param
    const separator = coupon_url.includes("?") ? "&" : "?";
    const final_url = `${coupon_url}${separator}sub_id=${encodeURIComponent(sub_id)}`;

    const ip_address =
      (req.headers["x-forwarded-for"] || "").split(",").shift().trim() ||
      req.socket.remoteAddress ||
      null;
    const user_agent = req.headers["user-agent"] || null;

    const sql = `
      INSERT INTO click_tracking
        (wp_user_id, campaign_id, sub_id, coupon_url, final_redirect_url, ip_address, user_agent)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id
    `;

    const { rows } = await db.query(sql, [
      wpUserId,
      campaignId,
      sub_id,
      coupon_url,
      final_url,
      ip_address,
      user_agent,
    ]);

    return res.status(201).json({
      success: true,
      sub_id,
      final_url,
      click_id: rows[0]?.id || null,
    });
  } catch (err) {
    console.error("ERROR generateSubIdAndTrack:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

// Optional debug route to fetch click by sub_id
export const getClickBySubId = async (req, res) => {
  try {
    const { sub_id } = req.params;
    if (!sub_id) return res.status(400).json({ success: false, message: "sub_id required" });

    const { rows } = await db.query(
      "SELECT * FROM click_tracking WHERE sub_id = $1 LIMIT 1",
      [sub_id]
    );

    if (!rows.length) return res.status(404).json({ success: false, message: "Not found" });

    return res.json({ success: true, click: rows[0] });
  } catch (err) {
    console.error("ERROR getClickBySubId:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};
