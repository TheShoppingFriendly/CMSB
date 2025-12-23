// backend/server.js
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import helmet from "helmet";

// Load env variables
dotenv.config();

// Import DB connection
// import db from "./db.js";

// Import Routes (ONLY the ones you have)
import clickTrackingRoutes from "./routes/clickTrackingRoutes.js";
import conversionRoutes from "./routes/conversionRoutes.js";
import pixelRoutes from "./routes/pixelRoutes.js";
import adminRoutes from "./admin/admin.routes.js";
import adminAuthRoutes from "./routes/adminAuthRoutes.js";
import adminDataRoutes from "./routes/adminDataRoutes.js";


const app = express();

// CORS setup
app.use(
  cors({
    origin: function (origin, callback) { 
      // Define all known safe origins
      const allowedOrigins = [
        "https://thegreatbuying.com",
        "https://checkout.shopify.com",
        "https://www.amgadgets.com",
        "https://amgadgets.com",
        "http://localhost:5173",
        "https://cmsfront-seven.vercel.app",
      ];
        
      // CRITICAL FIX: Check if the origin is in the allowed list OR if it is 'null'
      if (!origin || allowedOrigins.includes(origin) || origin === 'null') {
        callback(null, true); // Allow the request
      } else {
        callback(new Error(`CORS policy violation for origin: ${origin}`), false); // Block the request
      }
    },
    methods: ["GET", "POST"],
    credentials: true, 
  })
);

app.use(express.json());

// Mount Routes
app.use("/api", clickTrackingRoutes);
app.use("/api", conversionRoutes);
app.use("/api", pixelRoutes);

app.use("/api/admin/auth", adminAuthRoutes);
app.use("/api/admin", adminDataRoutes);


// Default Route
app.get("/", (req, res) => {
  res.send("Tracking API Running 2...");
});


app.use(helmet());


app.use("/api/admin", adminRoutes);


// Start Server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
