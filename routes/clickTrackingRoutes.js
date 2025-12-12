import express from "express";
import {
  generateClickIdAndTrack,
  getClickByClickId,
  // 1. IMPORT the new function from the controller
  serverRedirectAndSetCookie 
} from "../controllers/clickController.js";

const router = express.Router();

console.log("✅ clickTrackingRoutes loaded");

// Generate clickid + record click (OLD AJAX ROUTE - Kept for safety/legacy API)
router.post("/generate-clickid", generateClickIdAndTrack);

// 2. NEW ROUTE FOR DIRECT USER CLICKS (Server-Side Cookie Setting)
// This is the endpoint the WordPress plugin will now direct the browser to.
router.get("/redirect-click", serverRedirectAndSetCookie);

// Debug route
router.get("/clicks/:clickid", getClickByClickId);

export default router;