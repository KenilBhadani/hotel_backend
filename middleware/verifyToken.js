const jwt = require("jsonwebtoken");

module.exports = function verifyToken(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      console.log("❌ verifyToken: No Bearer token in header");
      return res.status(401).json({ error: "No token provided" });
    }

    const token = authHeader.split(" ")[1];
    console.log("🔍 verifyToken: Token received, length:", token.length);

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    console.log("✅ verifyToken: Token verified successfully, userId:", decoded.userId, "role:", decoded.role);

    req.user = decoded;
    next();
  } catch (err) {
    console.error("❌ verifyToken error:", err.message);
    console.error("   Token:", req.headers.authorization?.substring(0, 50) + "...");
    console.error("   JWT_SECRET exists:", !!process.env.JWT_SECRET);
    return res.status(401).json({ error: "Invalid or expired token" });
  }
};
