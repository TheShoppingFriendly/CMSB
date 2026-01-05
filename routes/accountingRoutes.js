import express from "express";
// import { getAccountingReport } from "../modules/accounting/accounting.controller.js";
import { adminAuth } from "../middleware/adminAuth.js";
import { getAccountingReport } from "../modules/accounting/accounting.controller.js";

const router = express.Router();

// PROTECTED: Only authenticated admins can access financial data
router.get("/report", adminAuth, getAccountingReport);

export default router;