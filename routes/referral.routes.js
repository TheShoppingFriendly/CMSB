import express from "express";
import { getMyReferrals } from "../modules/users/referral.controller.js";
import apiKeyAuth from "../middleware/apiKeyAuth.js";

const router = express.Router();

// The endpoint WordPress calls: /api/referrals/my-list
router.get("/my-list", apiKeyAuth, getMyReferrals);

export default router;