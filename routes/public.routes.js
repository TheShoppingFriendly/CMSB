import express from "express";
const router = express.Router();
import { getPublicUserStats } from "../controllers/public.controller.js";

// This route serves the WordPress plugin
router.get("/stats/:wp_user_id", getPublicUserStats);

export default router;