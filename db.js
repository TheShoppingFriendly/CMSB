// backend/db.js
import pkg from "pg";
import dotenv from "dotenv";
dotenv.config();

const { Pool } = pkg;

// PostgreSQL Connection Pool (Render Compatible)
const pool = new Pool({
  connectionString: process.env.DATABASE_URL, // Render gives this automatically
  ssl: {
    rejectUnauthorized: false, // Required for Render PostgreSQL
  },
});

// Test Connection
pool
  .connect()
  .then((client) => {
    console.log("✅ PostgreSQL connected");
    client.release();
  })
  .catch((err) => {
    console.error("❌ PostgreSQL connection error:", err);
    process.exit(1);
  });

export default pool;
