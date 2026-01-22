import express from "express";
import * as controller from "../controllers/admin.finance.controller.js";
import requireAdmin from "../middleware/requireAdmin.js";

const router = express.Router();

// SYSTEM
router.get("/overview", requireAdmin, controller.getOverview);

// LEDGER
router.get("/ledger", requireAdmin, controller.getLedger);
router.get("/journey/:id", requireAdmin, controller.getJourney);

// WALLETS
router.get("/wallet/:wpUserId", requireAdmin, controller.getWallet);

// PAYOUTS
router.post("/payout/approve", requireAdmin, controller.approvePayout);
router.post("/payout/send", requireAdmin, controller.markPayoutSent);

// ADMIN ACTIONS
router.post("/manual-adjust", requireAdmin, controller.manualAdjustment);

export default router;
