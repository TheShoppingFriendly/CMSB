import express from "express";
import { adminAuth } from "../middleware/adminAuth.js";
import db from "../db.js";

const router = express.Router();

router.get("/clicks", adminAuth, async (req, res) => {
  const { rows } = await db.query(
    "SELECT * FROM click_tracking ORDER BY created_at DESC LIMIT 100"
  );
  res.json(rows);
});

router.get("/conversions", adminAuth, async (req, res) => {
  const { rows } = await db.query(
    "SELECT * FROM conversions ORDER BY created_at DESC LIMIT 100"
  );
  res.json(rows);
});

export default router;
