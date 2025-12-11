// backend/server.js
import express from "express";
import cors from "cors";
import dotenv from "dotenv";

// Load env variables
dotenv.config();

// Import DB connection
// import db from "./db.js";

// Import Routes (ONLY the ones you have)
import clickTrackingRoutes from "./routes/clickTrackingRoutes.js";
import conversionRoutes from "./routes/conversionRoutes.js";
import pixelRoutes from "./routes/pixelRoutes.js";


const app = express();

// CORS setup
app.use(
  cors({
    origin: [
      "https://thegreatbuying.com", // Your WordPress domain (Keep this for the initial AJAX request)
      "https://checkout.shopify.com", // Mandatory universal checkout domain
      "https://www.amgadgets.com",    // The custom domain you are testing
      "https://amgadgets.com",        // The naked domain (good practice)
      // Add more brand domains here as you expand:
      // "https://brand-b.com",
    ],
    methods: ["GET", "POST"], // Keep these methods
    credentials: true,       // Keep credentials if you use session cookies/auth
  })
);

app.use(express.json());

// Mount Routes
app.use("/api", clickTrackingRoutes);
app.use("/api", conversionRoutes);
app.use("/api", pixelRoutes);


// Default Route
app.get("/", (req, res) => {
  res.send("Tracking API Running 2...");
});

// Start Server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
