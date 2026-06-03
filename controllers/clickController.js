import db from "../db.js";
import { generateClickId } from "../utils/clickid.js";
import geoip from "geoip-lite";

// ------------------------
// CREATE CLICK + clickid
// ------------------------
export const generateClickIdAndTrack = async (req, res) => {
    try {

        const {
            wp_user_id,
            coupon_url,
            campaign_id,
            tracking_type,
            user_type
        } = req.body;

        if (!coupon_url) {
            return res.status(400).json({
                success: false,
                message: "coupon_url is required"
            });
        }

        const wpUserId =
            wp_user_id
                ? Number(wp_user_id)
                : null;

        const campaignId =
            campaign_id
                ? Number(campaign_id)
                : null;

        const safeTrackingType =
            tracking_type === "pixel"
                ? "pixel"
                : "affiliate";

        const safeUserType =
            user_type === "registered"
                ? "registered"
                : "guest";

        const clickid = generateClickId();

        /*
        |--------------------------------------------------------------------------
        | Final URL
        |--------------------------------------------------------------------------
        */
        let final_url = coupon_url;

        /*
        |--------------------------------------------------------------------------
        | IP Address
        |--------------------------------------------------------------------------
        */
        const ip_address =
            (req.headers["x-forwarded-for"] || "")
                .split(",")
                .shift()
                .trim()
            ||
            req.socket.remoteAddress
            ||
            null;

        /*
        |--------------------------------------------------------------------------
        | User Agent
        |--------------------------------------------------------------------------
        */
        const user_agent =
            req.headers["user-agent"]
            ||
            null;

        /*
        |--------------------------------------------------------------------------
        | Referrer
        |--------------------------------------------------------------------------
        */
        const referrer =
            req.body.referrer
            ||
            req.headers["referer"]
            ||
            null;

        /*
        |--------------------------------------------------------------------------
        | Geo Location
        |--------------------------------------------------------------------------
        */
        let country = null;
        let city = null;

        if (ip_address) {

            const geo =
                geoip.lookup(ip_address);

            if (geo) {

                country =
                    geo.country || null;

                city =
                    geo.city || null;
            }
        }

        /*
        |--------------------------------------------------------------------------
        | Insert Click
        |--------------------------------------------------------------------------
        */
        const sql = `
            INSERT INTO click_tracking
            (
                wp_user_id,
                campaign_id,
                clickid,
                coupon_url,
                final_redirect_url,
                ip_address,
                user_agent,
                tracking_type,
                country,
                city,
                referrer,
                user_type
            )
            VALUES
            (
                $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12
            )
            RETURNING id
        `;

        const { rows } = await db.query(
            sql,
            [
                wpUserId,
                campaignId,
                clickid,
                coupon_url,
                final_url,
                ip_address,
                user_agent,
                safeTrackingType,
                country,
                city,
                referrer,
                safeUserType
            ]
        );

        return res.status(201).json({
            success: true,
            clickid,
            final_url,
            tracking_type: safeTrackingType,
            user_type: safeUserType,
            click_id: rows[0]?.id || null
        });

    } catch (err) {

        console.error(
            "ERROR generateClickIdAndTrack:",
            err
        );

        return res.status(500).json({
            success: false,
            message: "Server error"
        });
    }
};

// ------------------------
// GET CLICK BY clickid
// ------------------------
export const getClickByClickId = async (req, res) => {
    try {

        const { clickid } = req.params;

        if (!clickid) {

            return res.status(400).json({
                success: false,
                message: "clickid required"
            });
        }

        const { rows } = await db.query(
            `
            SELECT *
            FROM click_tracking
            WHERE clickid = $1
            LIMIT 1
            `,
            [clickid]
        );

        if (!rows.length) {

            return res.status(404).json({
                success: false,
                message: "Not found"
            });
        }

        return res.json({
            success: true,
            click: rows[0]
        });

    } catch (err) {

        console.error(
            "ERROR getClickByClickId:",
            err
        );

        return res.status(500).json({
            success: false,
            message: "Server error"
        });
    }
};