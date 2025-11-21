// backend/server.js
import express from "express";
import cors from "cors";
import dotenv from "dotenv";

// Load env variables
dotenv.config();

// Import DB connection
import db from "./db.js";

// Import Routes (ONLY the ones you have)
import clickTrackingRoutes from "./routes/clickTrackingRoutes.js";
// import conversionRoutes from "./routes/conversionRoutes.js";

const app = express();

// CORS setup
app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST"],
    credentials: true,
  })
);

app.use(express.json());

// Mount Routes
app.use("/api", clickTrackingRoutes);
// app.use("/api", conversionRoutes);

// Default Route
app.get("/", (req, res) => {
  res.send("Tracking API Running 1...");
});

// Start Server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
