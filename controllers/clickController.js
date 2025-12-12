import db from "../db.js";
import { generateClickId } from "../utils/clickid.js";

// ------------------------
// CREATE CLICK + clickid (Existing AJAX Handler - UNMODIFIED)
// ------------------------
// NOTE: This function remains as you provided it. 
// It returns a JSON response and will no longer be used for the main user click flow.
export const generateClickIdAndTrack = async (req, res) => {
    try {
        const { wp_user_id, coupon_url, campaign_id, tracking_type } = req.body;

        if (!coupon_url) {
            return res.status(400).json({ success: false, message: "coupon_url is required" });
        }

        const wpUserId = wp_user_id ? Number(wp_user_id) : null;
        const campaignId = campaign_id ? Number(campaign_id) : null;

        // tracking_type comes from WordPress ACF
        const safeTrackingType =
            tracking_type === "pixel" ? "pixel" : "affiliate";

        const clickid = generateClickId();

        let final_url = coupon_url;
        
        const ip_address =
            (req.headers["x-forwarded-for"] || "").split(",").shift().trim() ||
            req.socket.remoteAddress ||
            null;
        const user_agent = req.headers["user-agent"] || null;

        const sql = `
            INSERT INTO click_tracking
             (wp_user_id, campaign_id, clickid, coupon_url, final_redirect_url, ip_address, user_agent, tracking_type)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING id
        `;

        const { rows } = await db.query(sql, [
            wpUserId,
            campaignId,
            clickid,
            coupon_url,
            final_url, // final_url in DB is the base URL
            ip_address,
            user_agent,
            safeTrackingType,
        ]);

        return res.status(201).json({
            success: true,
            clickid,
            final_url, // Return the base URL for the client (WordPress) to construct the final link
            tracking_type: safeTrackingType,
            click_id: rows[0]?.id || null,
        });
    } catch (err) {
        console.error("ERROR generateClickIdAndTrack:", err);
        return res.status(500).json({ success: false, message: "Server error" });
    }
};

// ------------------------
// SERVER REDIRECT AND COOKIE SETTING (NEW FUNCTION for the new flow)
// ------------------------
/**
 * Handles the direct user click, generates the ClickID, logs it,
 * sets the clickid cookie via HTTP header, and performs a 302 redirect.
 * This replaces the old client-side AJAX flow.
 */
export const serverRedirectAndSetCookie = async (req, res) => {
    try {
        // Data now comes from URL query parameters (req.query), not body
        // We include 'clickid_param' (e.g., p1, sub1) which the WP plugin must pass.
        const { coupon_url, campaign_id, tracking_type, wp_user_id, clickid_param } = req.query;

        // 1. Validation and Initial Setup
        if (!coupon_url) {
            return res.status(400).send("coupon_url is required for redirection.");
        }

        const wpUserId = wp_user_id ? Number(wp_user_id) : null;
        const campaignId = campaign_id ? Number(campaign_id) : null;
        const safeTrackingType = tracking_type === "pixel" ? "pixel" : "affiliate";
        // Default to 'p1' if param name is missing
        const finalClickIdParam = clickid_param || 'p1'; 

        // 2. Generate Click ID and Log (Same logic as existing function)
        const clickid = generateClickId();
        let final_url = coupon_url;
        
        const ip_address =
            (req.headers["x-forwarded-for"] || "").split(",").shift().trim() ||
            req.socket.remoteAddress ||
            null;
        const user_agent = req.headers["user-agent"] || null;

        const sql = `
            INSERT INTO click_tracking
             (wp_user_id, campaign_id, clickid, coupon_url, final_redirect_url, ip_address, user_agent, tracking_type)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        `;

        await db.query(sql, [
            wpUserId,
            campaignId,
            clickid,
            coupon_url,
            final_url,
            ip_address,
            user_agent,
            safeTrackingType,
        ]);

        // 3. --- CORE CHANGE: SET COOKIE AND PREPARE REDIRECT ---

        // Append the generated clickid to the final URL for the merchant
        let redirectUrl = new URL(final_url);
        redirectUrl.searchParams.set(finalClickIdParam, clickid);
        
        // Set the Cookie via HTTP Header
        // CRUCIAL: httpOnly: false allows the client-side pixel to read the cookie.
        res.cookie('clickid', clickid, {
            maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days in milliseconds
            httpOnly: false, 
            secure: true,    // Use HTTPS
            path: '/',
            sameSite: 'Lax',
        });
        
        // 4. Perform the HTTP 302 Redirection
        return res.redirect(redirectUrl.toString());

    } catch (err) {
        console.error("ERROR serverRedirectAndSetCookie:", err);
        return res.status(500).send("Server error during click redirection.");
    }
};


// ------------------------
// GET CLICK BY clickid (No changes needed - UNMODIFIED)
// ------------------------
export const getClickByClickId = async (req, res) => {
    try {
        const { clickid } = req.params;
        if (!clickid)
            return res.status(400).json({ success: false, message: "clickid required" });

        const { rows } = await db.query(
            "SELECT * FROM click_tracking WHERE clickid = $1 LIMIT 1",
            [clickid]
        );

        if (!rows.length)
            return res.status(404).json({ success: false, message: "Not found" });

        return res.json({ success: true, click: rows[0] });
    } catch (err) {
        console.error("ERROR getClickByClickId:", err);
        return res.status(500).json({ success: false, message: "Server error" });
    }
};