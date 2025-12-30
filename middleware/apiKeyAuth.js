export default function apiKeyAuth(req, res, next) {
  const key = req.headers["x-api-key"];

  if (!key || key !== process.env.WP_API_KEY) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  next();
}
