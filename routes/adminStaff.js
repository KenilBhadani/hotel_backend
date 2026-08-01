const express = require("express");
const bcrypt = require("bcryptjs");
const Staff = require("../models/Staff");

const router = express.Router();

/* ===============================
   CREATE STAFF (ADMIN ONLY)
================================ */
router.post("/", async (req, res) => {
  try {
    const { name, email, phone, role, shift, password } = req.body;

    if (!name || !email || !phone || !role || !password) {
      return res.status(400).json({ message: "All required fields missing" });
    }

    // ✅ Check for duplicate email (case-insensitive)
    const normalizedEmail = email.trim().toLowerCase();
    const exists = await Staff.findOne({
      email: { $regex: new RegExp(`^${normalizedEmail}$`, 'i') }
    });

    if (exists) {
      return res.status(409).json({
        message: `A staff member with email "${email}" already exists.`
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const staffCount = await Staff.countDocuments();
    const staffId = `STF-${String(staffCount + 1).padStart(3, "0")}`;

    const staff = await Staff.create({
      staffId,
      name,
      email: normalizedEmail,
      phone,
      role,
      shift,
      password: hashedPassword,
      isActive: true, // default active
    });

    res.status(201).json(staff);
  } catch (err) {
    console.error("CREATE STAFF ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
});

/* ===============================
   GET ALL STAFF
================================ */
router.get("/", async (req, res) => {
  try {
    const staff = await Staff.find().sort({ createdAt: -1 }).lean();
    res.json(staff);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

/* ===============================
   UPDATE STAFF INFO
================================ */
router.put("/:id", async (req, res) => {
  try {
    const { password, email, ...updateData } = req.body;

    // ✅ Check for duplicate email when updating (case-insensitive)
    if (email) {
      const normalizedEmail = email.trim().toLowerCase();
      const existingStaff = await Staff.findOne({
        email: { $regex: new RegExp(`^${normalizedEmail}$`, 'i') },
        _id: { $ne: req.params.id } // Exclude current staff
      });

      if (existingStaff) {
        return res.status(409).json({
          message: `A staff member with email "${email}" already exists.`
        });
      }

      updateData.email = email;
    }

    // Only hash/update password if provided and non-empty
    if (password && password.trim() !== "") {
      updateData.password = await bcrypt.hash(password, 10);
    }

    const updated = await Staff.findByIdAndUpdate(req.params.id, updateData, { new: true });
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Update failed" });
  }
});

/* ===============================
   TOGGLE STAFF STATUS (ENABLE/DISABLE)
================================ */
router.put("/:id/status", async (req, res) => {
  try {
    const { isActive } = req.body;
    if (typeof isActive !== "boolean") {
      return res.status(400).json({ message: "isActive must be boolean" });
    }

    const updated = await Staff.findByIdAndUpdate(
      req.params.id,
      { isActive },
      { new: true }
    );

    res.json(updated);
  } catch (err) {
    console.error("TOGGLE STAFF STATUS ERROR:", err);
    res.status(500).json({ message: "Update failed" });
  }
});

/* ===============================
   DELETE STAFF
================================ */
router.delete("/:id", async (req, res) => {
  try {
    const deleted = await Staff.findByIdAndDelete(req.params.id);
    if (!deleted) {
      return res.status(404).json({ message: "Staff not found" });
    }
    res.json({ message: "Staff deleted successfully" });
  } catch (err) {
    console.error("DELETE STAFF ERROR:", err);
    res.status(500).json({ message: "Delete failed" });
  }
});

module.exports = router;
