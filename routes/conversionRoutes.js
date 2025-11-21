import express from "express";
import { handlePostback } from "../controllers/postbackController.js";

const router = express.Router();

console.log("✅ conversionRoutes loaded");

// Postback/Conversion Endpoint
// Accepts GET or POST, as configured in the controller
router.all("/postback", handlePostback);

export default router;