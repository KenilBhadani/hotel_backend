const express = require("express");
const router = express.Router();

const ContactMessage = require("../models/ContactMessage");

router.post("/", async (req, res) => {
  try {
    const { name, email, subject, message } = req.body;

    if (!name || !email || !message) {
      return res.status(400).json({
        success: false,
        message: "Name, email, and message are required",
      });
    }

    const savedMessage = await ContactMessage.create({
      name: String(name).trim(),
      email: String(email).trim().toLowerCase(),
      subject: subject ? String(subject).trim() : "",
      message: String(message).trim(),
    });

    return res.status(201).json({
      success: true,
      message: "Contact message saved successfully",
      id: savedMessage._id,
    });
  } catch (err) {
    console.error("Contact save error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to save contact message",
    });
  }
});

module.exports = router;
