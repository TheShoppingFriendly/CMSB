import express from "express";
import { 
  getAllUsers, 
  updateUserBalance, 
  syncUsers, 
  getUserActivity, 
  revertSettlement,
  getUserStats // <--- 1. Import the new stats function
} from "./user.controller.js";
import { adminAuth } from "../../middleware/adminAuth.js";
import apiKeyAuth from "../../middleware/apiKeyAuth.js";

const router = express.Router();

// --- PUBLIC / WP FRONTEND ROUTES ---
// Secured by API Key because WordPress calls these
router.post("/sync", apiKeyAuth, syncUsers);
router.get("/public/stats/:id", apiKeyAuth, getUserStats); // <--- 2. New route for the WP Dashboard

// --- ADMIN DASHBOARD ROUTES ---
// Secured by Admin JWT Token
router.get("/", adminAuth, getAllUsers);
router.patch("/update-balance", adminAuth, updateUserBalance);
router.get("/:id/activity", adminAuth, getUserActivity);
router.post("/revert-settlement", adminAuth, revertSettlement); // <--- 3. Added adminAuth for security

export default router;