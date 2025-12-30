import express from "express";
import { syncStores, getStoresForAdmin } from "./store.controller.js";
import apiKeyAuth from "../../middleware/apiKeyAuth.js";
import adminAuth from "../../middleware/adminAuth.js";

const router = express.Router();

// WordPress → Backend
router.post("/sync", apiKeyAuth, syncStores);

// Admin CMS → Backend
router.get("/", adminAuth, getStoresForAdmin);

export default router;
