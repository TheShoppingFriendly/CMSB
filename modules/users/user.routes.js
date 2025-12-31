import express from "express";
import { getAllUsers, updateUserBalance, syncUsers } from "./user.controller.js";
import { adminAuth } from "../../middleware/adminAuth.js";
import { apiKeyAuth } from "../../middleware/apiKeyAuth.js";

const router = express.Router();

// Public-ish Sync Route (Secured by API Key from WordPress)
router.post("/sync", apiKeyAuth, syncUsers);

// Admin Dashboard Routes (Secured by Admin JWT Token)
router.get("/", adminAuth, getAllUsers);
router.patch("/update-balance", adminAuth, updateUserBalance);

export default router;