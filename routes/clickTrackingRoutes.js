import express from "express";
import {
  generateClickIdAndTrack,
  getClickByClickId
} from "../controllers/clickController.js";

const router = express.Router();

console.log("✅ clickTrackingRoutes loaded");

// Generate clickid + record click
router.post("/generate-clickid", generateClickIdAndTrack);

// Debug route
router.get("/clicks/:clickid", getClickByClickId);

export default router;
