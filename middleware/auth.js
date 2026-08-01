const jwt = require("jsonwebtoken");

/**
 * Auth middleware
 * Supports:
 *  - Session / Passport login
 *  - JWT (Bearer token) login
 * Sets req.user = { userId, role }
 * 
 * IMPORTANT: Only accepts user sessions, not staff sessions
 */
module.exports = function auth(req, res, next) {
  try {
    // 1️⃣ Session login - ONLY accept user sessions
    if (req.session?.user) {
      // Reject if staff session exists (prevent cross-role access)
      if (req.session.staff) {
        console.log("❌ auth: Staff session detected, rejecting");
        return res.status(403).json({ error: "Please logout from staff panel first" });
      }

      const s = req.session.user;
      req.user = {
        userId: s.id || s._id,
        role: s.role || "user",
      };
      console.log("✅ auth: Session authenticated, userId:", req.user.userId, "role:", req.user.role);
      return next();
    }

    // 2️⃣ JWT token login
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      console.log("❌ auth: No Bearer token provided");
      return res.status(401).json({ error: "No token provided" });
    }

    const token = authHeader.split(" ")[1];
    console.log("🔍 auth: Verifying JWT token, length:", token.length);

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    console.log("🔍 auth: Token decoded:", { userId: decoded.userId, role: decoded.role, staffId: decoded.staffId });

    // Ensure this is a user token, not a staff token
    if (decoded.staffId) {
      console.log("❌ auth: Staff token detected, rejecting");
      return res.status(403).json({ error: "Staff token not allowed for user routes" });
    }

    req.user = {
      userId: decoded.userId || decoded.id,
      role: decoded.role || "user",
    };

    console.log("✅ auth: JWT authenticated, userId:", req.user.userId, "role:", req.user.role);
    next();
  } catch (err) {
    console.error("❌ AUTH MIDDLEWARE ERROR:", err.message);
    console.error("   JWT_SECRET exists:", !!process.env.JWT_SECRET);
    console.error("   Token preview:", req.headers.authorization?.substring(0, 50) + "...");
    return res.status(401).json({ error: "Invalid token" });
  }
};
