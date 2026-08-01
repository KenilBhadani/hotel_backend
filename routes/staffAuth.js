const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const Staff = require("../models/Staff");

const router = express.Router();

router.post("/login", async (req, res) => {
  const { email, password } = req.body;

  const staff = await Staff.findOne({ email }).select("+password");
  if (!staff) {
    return res.status(401).json({ message: "Invalid credentials" });
  }

  const isMatch = await bcrypt.compare(password, staff.password);
  if (!isMatch) {
    return res.status(401).json({ message: "Invalid credentials" });
  }

  const token = jwt.sign(
    { staffId: staff._id, role: staff.role },
    process.env.JWT_SECRET,
    { expiresIn: "1d" }
  );

  // store staff session if possible
  if (req.session) {
    // Clear any existing user session to prevent cross-role access
    if (req.session.user) {
      delete req.session.user;
    }

    req.session.staff = { staffId: staff._id.toString(), role: staff.role };
  }

  res.json({
    token,
    staff: {
      id: staff._id,
      name: staff.name,
      role: staff.role
    }
  });
});

// GET staff session info
router.get('/me', (req, res) => {
  if (req.session && req.session.staff) {
    return res.json({ id: req.session.staff.staffId, role: req.session.staff.role });
  }
  // fallback to token
  const auth = req.headers.authorization;
  if (!auth) return res.status(401).json({ message: 'Unauthorized' });
  try {
    const token = auth.replace('Bearer ', '');
    const data = jwt.verify(token, process.env.JWT_SECRET);
    return res.json({ id: data.staffId, role: data.role });
  } catch (err) {
    return res.status(401).json({ message: 'Invalid token' });
  }
});

// Staff logout - clears session
router.get('/logout', (req, res) => {
  try {
    req.session?.destroy(() => {
      res.clearCookie('connect.sid');
      res.json({ success: true });
    });
  } catch (e) {
    console.error('Staff logout error', e);
    res.json({ success: false });
  }
});

// staff logout without destroying the entire session (keeps other roles' session data intact)
router.get('/logout', (req, res) => {
  try {
    if (req.session && req.session.staff) {
      delete req.session.staff;
      // save session and respond; do not clear cookie to avoid affecting other session data
      req.session.save(() => res.json({ success: true }));
      return;
    }
    res.json({ success: true });
  } catch (err) {
    console.error('Staff logout failed', err);
    res.status(500).json({ success: false });
  }
});

module.exports = router;
