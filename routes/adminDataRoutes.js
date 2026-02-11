import express from "express";
import { adminAuth } from "../middleware/adminAuth.js";
import db from "../db.js";

const router = express.Router();

router.get("/clicks", adminAuth, async (req, res) => {
  try {
    const { rows } = await db.query(`
      SELECT 
        ct.*,
        s.name AS store_name,
        (s.name || ' (' || s.id || ')') AS store_display
      FROM click_tracking ct
      LEFT JOIN stores s ON ct.campaign_id = s.id
      ORDER BY ct.created_at DESC
      LIMIT 100
    `);

    res.json(rows);
  } catch (err) {
    console.error("Error fetching clicks:", err);
    res.status(500).json({ message: "Server error" });
  }
});


router.get("/conversions", adminAuth, async (req, res) => {
  const { rows } = await db.query(
    "SELECT * FROM conversions ORDER BY created_at DESC LIMIT 100"
  );
  res.json(rows);
});

export default router;
