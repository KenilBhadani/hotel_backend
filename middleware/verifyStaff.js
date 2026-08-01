const jwt = require("jsonwebtoken");

function verifyStaff(req, res, next) {
  try {
    // Session-based staff
    if (req.session?.staff) {
      // Reject if user session exists (prevent cross-role access)
      if (req.session.user) {
        return res.status(403).json({ message: "Please logout from user account first" });
      }

      const s = req.session.staff;
      const validRoles = ["housekeeping", "receptionist", "manager", "admin", "maintenance"];
      if (!validRoles.includes(s.role.toLowerCase()))
        return res.status(403).json({ message: "Forbidden" });
      req.user = { userId: s.staffId || s.userId || s.id, role: s.role };
      return next();
    }

    // Session-based admin user (allow admin users to access staff routes)
    if (req.session?.user && req.session.user.role === 'admin') {
      console.log("Admin user accessing staff route via session");
      req.user = { userId: req.session.user.id, role: 'admin' };
      return next();
    }

    const auth = req.headers.authorization;
    if (!auth) return res.status(401).json({ message: "Unauthorized" });
    const token = auth.replace("Bearer ", "");
    const data = jwt.verify(token, process.env.JWT_SECRET);

    console.log("Token data:", { userId: data.userId, staffId: data.staffId, role: data.role });

    // Allow admin users to access staff routes
    if (data.userId && data.role === 'admin') {
      console.log("Admin user accessing staff route via JWT");
      req.user = { userId: data.userId, role: 'admin' };
      return next();
    }

    // Ensure this is a staff token, not a regular user token
    if (!data.staffId && data.userId) {
      console.log("Blocking non-admin user token");
      return res.status(403).json({ message: "User token not allowed for staff routes" });
    }

    const validRoles = ["housekeeping", "receptionist", "manager", "admin", "maintenance"];

    if (!data || !validRoles.includes((data.role || "").toLowerCase()))
      return res.status(403).json({ message: "Forbidden" });

    req.user = { userId: data.staffId || data.userId || data.id, role: data.role };
    next();
  } catch (err) {
    console.error("verifyStaff error", err.message);
    return res.status(401).json({ message: "Invalid token" });
  }
}

module.exports = verifyStaff;
