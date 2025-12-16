import express from "express";
import { requireAdmin } from "./admin.middleware.js";
import {
  getClicks,
  getConversions
} from "./admin.controller.js";

const router = express.Router();

router.get("/clicks", requireAdmin, getClicks);
router.get("/conversions", requireAdmin, getConversions);

export default router;
