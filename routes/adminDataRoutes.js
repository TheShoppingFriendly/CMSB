import express from "express";
import { adminAuth } from "../middleware/adminAuth.js";
import db from "../db.js";

const router = express.Router();

router.get("/clicks", adminAuth, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const offset = (page - 1) * limit;

    const { rows } = await db.query(
      `SELECT 
        ct.*,
        s.name AS store_name,
        (s.name || ' (' || s.id || ')') AS store_display
      FROM click_tracking ct
      LEFT JOIN stores s ON ct.campaign_id = s.id
      ORDER BY ct.created_at DESC
      LIMIT $1 OFFSET $2`,
      [limit, offset]
    );

    res.json({
      page,
      limit,
      data: rows
    });

  } catch (err) {
    console.error("Error fetching clicks:", err);
    res.status(500).json({ message: "Server error" });
  }
});


router.get("/conversions", adminAuth, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const offset = (page - 1) * limit;

    const { rows } = await db.query(
      `SELECT 
        c.*,
        ct.referrer,  
        ct.city,
        ct.country,
        ct.user_agent
      FROM conversions c
      LEFT JOIN click_tracking ct 
        ON c.click_id = ct.id
      ORDER BY c.created_at DESC
      LIMIT $1 OFFSET $2`,
      [limit, offset]
    );

    res.json({
      page,
      limit,
      data: rows
    });

  } catch (err) {
    console.error("Error fetching conversions:", err);
    res.status(500).json({ message: "Server error" });
  }
});
export default router;
