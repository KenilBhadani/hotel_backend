const express = require("express");
const passport = require("passport");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const User = require("../models/User");
const sendEmail = require("../utils/sendEmail");

const router = express.Router();
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3000";

/* ================= REGISTER ================= */
router.post("/register", async (req, res) => {
  try {
    const { name, email, phone, password } = req.body;

    if (!name || !email || !phone || !password) {
      return res.status(400).json({ message: "All fields are required" });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const normalizedPhone = phone.trim();

    // Check for existing email
    const existingEmail = await User.findOne({ email: normalizedEmail });
    if (existingEmail) {
      return res.status(400).json({
        message: "Email already registered",
        field: "email"
      });
    }

    // Check for existing phone
    const existingPhone = await User.findOne({ phone: normalizedPhone });
    if (existingPhone) {
      return res.status(400).json({
        message: "Phone number already registered",
        field: "phone"
      });
    }

    // ⚠️ DO NOT HASH HERE – model does it
    const user = await User.create({
      name,
      email: normalizedEmail,
      phone: normalizedPhone,
      password,
      provider: "local",
    });

    const token = jwt.sign(
      { userId: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "1d" }
    );

    if (req.session) {
      req.session.user = {
        id: user._id.toString(),
        role: user.role,
        email: user.email,
      };
    }

    res.status(201).json({
      message: "Registration successful",
      token,
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
      },
    });
  } catch (error) {
    console.error("❌ Register error:", error);

    // Handle MongoDB duplicate key error
    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern)[0];
      const fieldName = field === 'email' ? 'Email' : 'Phone number';
      return res.status(400).json({
        message: `${fieldName} already registered`,
        field: field
      });
    }

    res.status(500).json({ message: "Registration failed" });
  }
});

/* ================= LOGIN ================= */
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password)
      return res.status(400).json({ message: "Email and password required" });

    const user = await User.findOne({
      email: email.trim().toLowerCase(),
    }).select("+password");

    if (!user) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

    if (user.provider !== "local") {
      return res.status(400).json({ message: "Please login using Google" });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

    if (req.session) {
      // Clear any existing staff session to prevent cross-role access
      if (req.session.staff) {
        delete req.session.staff;
      }

      req.session.user = {
        id: user._id.toString(),
        role: user.role,
        email: user.email,
      };
    }

    const token = jwt.sign(
      { userId: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "1d" }
    );

    res.json({
      token,
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
      },
    });
  } catch (error) {
    console.error("❌ Login error:", error);
    res.status(500).json({ message: "Login failed" });
  }
});

/* ================= CHECK EMAIL EXISTS ================= */
router.get("/check-email", async (req, res) => {
  try {
    const email = String(req.query.email || "").trim().toLowerCase();
    if (!email) {
      return res.status(400).json({ message: "Email is required" });
    }

    const user = await User.findOne({ email }).select("email provider role name");
    if (!user) {
      return res.json({ exists: false });
    }

    return res.json({
      exists: true,
      user: {
        email: user.email,
        provider: user.provider || "local",
        role: user.role,
        name: user.name,
      },
    });
  } catch (error) {
    console.error("Check email error:", error);
    return res.status(500).json({ message: "Unable to check email" });
  }
});

/* ================= GOOGLE LOGIN ================= */
router.get(
  "/google",
  passport.authenticate("google", { scope: ["profile", "email"] })
);

router.get(
  "/google/callback",
  passport.authenticate("google", {
    session: true,
    failureRedirect: `${FRONTEND_URL}/login`,
  }),
  (req, res) => {
    const user = req.user;

    const token = jwt.sign(
      { userId: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "1d" }
    );

    if (req.session) {
      req.session.user = {
        id: user._id.toString(),
        role: user.role,
        email: user.email,
      };
    }

    res.redirect(`${FRONTEND_URL}/login?token=${token}`);
  }
);

/* ================= GET LOGGED IN USER ================= */
router.get("/me", async (req, res) => {
  try {
    if (req.session?.user?.id) {
      const user = await User.findById(req.session.user.id).select("-password");
      return res.json(user);
    }

    const token = req.headers.authorization?.split(" ")[1];
    if (!token) return res.status(401).json({ message: "Unauthorized" });

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId).select("-password");

    res.json(user);
  } catch {
    res.status(401).json({ message: "Invalid token" });
  }
});

/* ================= LOGOUT ================= */
router.get("/logout", (req, res) => {
  try {
    req.session?.destroy(() => {
      res.clearCookie("connect.sid");
      res.redirect(FRONTEND_URL);
    });
  } catch (err) {
    console.error("Logout error", err);
    res.redirect(FRONTEND_URL);
  }
});

module.exports = router;
