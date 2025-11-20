// routes/clickTrackingRoutes.js
import express from "express";
import { 
  generateSubIdAndTrack, 
  getClickBySubId 
} from "../controllers/clickController.js";

const router = express.Router();

console.log("✅ clickTrackingRoutes loaded");

// Generate a sub_id + record a click
router.post("/generate-subid", generateSubIdAndTrack);

// Debug route for checking a click record
router.get("/clicks/:sub_id", getClickBySubId);

export default router;
