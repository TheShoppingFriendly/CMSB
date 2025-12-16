import db from "../db.js";

export async function getClicks(req, res) {
  const { page = 1, limit = 50 } = req.query;
  const offset = (page - 1) * limit;

  const [rows] = await db.query(
    "SELECT * FROM click_tracking ORDER BY created_at DESC LIMIT ? OFFSET ?",
    [Number(limit), Number(offset)]
  );

  res.json(rows);
}
