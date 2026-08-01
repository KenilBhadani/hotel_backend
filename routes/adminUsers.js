const express = require("express");
const router = express.Router();
const User = require("../models/User");
const auth = require("../middleware/auth");
const isAdmin = require("../middleware/isAdmin");

/* ================================
   GET ALL USERS (ADMIN) ✅ FIXED
================================ */
router.get("/", auth, isAdmin, async (req, res) => {
  try {
    // 🔥 lean() is REQUIRED here
    const users = await User.find().select("-password").lean();

    const formattedUsers = users.map(user => {
      const nameParts = (user.name || "").split(" ");

      return {
        _id: user._id,
        firstName: nameParts[0] || "",
        lastName: nameParts.slice(1).join(" "),
        email: user.email,
        mobileNo: user.phone || "",
        // 🔑 explicit false stays false
        isActive: user.isActive === false ? false : true
      };
    });

    res.json(formattedUsers);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to load users" });
  }
});

/* ================================
   BLOCK / UNBLOCK USER ✅ FIXED
================================ */
router.put("/:id/status", auth, isAdmin, async (req, res) => {
  try {
    const { isActive } = req.body;

    await User.updateOne(
      { _id: req.params.id },
      { $set: { isActive } },
      { strict: false } // allow extra field
    );

    res.json({ success: true, isActive });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to update status" });
  }
});

module.exports = router;
