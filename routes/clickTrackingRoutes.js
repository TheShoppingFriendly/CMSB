// routes/clickTrackingRoutes.js
import express from "express";
import { 
  generateClickIdAndTrack,
  getClickByClickId
} from "../controllers/clickController.js";

const router = express.Router();

console.log("✅ clickTrackingRoutes loaded");

// Generate a clickid + record a click
router.post("/generate-clickid", generateClickIdAndTrack);

// Debug route for checking a click record
router.get("/clicks/:clickid", getClickByClickId);

export default router;
