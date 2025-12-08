import express from "express";
import { handlePixelConversion } from "../controllers/pixelController.js";

const router = express.Router();

// Pixel iframe endpoint (GET)
router.get("/pixel", handlePixelConversion);

// Optional JSON pixel (POST)
router.post("/pixel", handlePixelConversion);

export default router;
