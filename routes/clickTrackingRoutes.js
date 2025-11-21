import express from "express";
import {
  generateClickIdAndTrack,
  getClickByClickId
} from "../controllers/clickController.js";

const router = express.Router();

console.log("✅ clickTrackingRoutes loaded");

// Generate clickid + record click
router.post("api/generate-clickid", generateClickIdAndTrack);

// Debug route
router.get("api/clicks/:clickid", getClickByClickId);

export default router;
