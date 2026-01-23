import express from "express";
import * as controller from "../controllers/admin.finance.controller.js";
// import adminAuth from "../middleware/adminAuth.js";
import { adminAuth } from "../middleware/adminAuth.js";

const router = express.Router();

// SYSTEM
router.get("/overview", adminAuth, controller.getOverview);

// LEDGER
router.get("/ledger", adminAuth, controller.getLedger);
router.get("/journey/:id", adminAuth, controller.getJourney);

// WALLETS
router.get("/wallet/:wpUserId", adminAuth, controller.getWallet);

// PAYOUTS
router.post("/payout/approve", adminAuth, controller.approvePayout);
router.post("/payout/send", adminAuth, controller.markPayoutSent);

// ADMIN ACTIONS
router.post("/manual-adjust", adminAuth, controller.manualAdjustment);

export default router;
