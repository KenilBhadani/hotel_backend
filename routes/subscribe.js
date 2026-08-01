const express = require("express");
const router = express.Router();
const sendEmail = require("../utils/sendEmail");
const Subscriber = require("../models/Subscriber");
const User = require("../models/User");

router.post("/", async (req, res) => {
  try {
    const {
      email,
      paymentMethod = "CARD",
      membershipFee = 0,
      paymentStatus = "PENDING",
      paymentIntentId = "",
    } = req.body;

    if (!email) {
      return res.status(400).json({ message: "Email required" });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const user = await User.findOne({ email: normalizedEmail });
    if (!user) {
      return res.status(400).json({ message: "Please register first" });
    }

    const existing = await Subscriber.findOne({ email: normalizedEmail });

    // Allow updating PENDING memberships to PAID
    if (existing?.membershipActive && existing?.paymentStatus === "PAID") {
      return res.status(409).json({
        success: false,
        message: "Email already subscribed with active membership",
      });
    }

    const isPaid = paymentStatus === "PAID";

    // Set expiration to 1 year from now if paid
    let expiresAt = null;
    if (isPaid) {
      const date = new Date();
      date.setFullYear(date.getFullYear() + 1);
      expiresAt = date;
    }

    const updateData = {
      userId: user._id,
      email: normalizedEmail,
      paymentMethod: "CARD",
      membershipFee: Number(membershipFee) || 0,
      paymentStatus: isPaid ? "PAID" : "PENDING",
      paymentIntentId: paymentIntentId || "",
      membershipActive: isPaid,
      expiresAt: expiresAt
    };

    // If updating from PENDING to PAID, log it
    if (existing && existing.paymentStatus === "PENDING" && isPaid) {
      console.log(`✅ Updated membership from PENDING to PAID for ${normalizedEmail}`);
    }

    await Subscriber.findOneAndUpdate(
      { email: normalizedEmail },
      updateData,
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    if (isPaid) {
      await sendEmail({
        to: normalizedEmail,
        subject: "Welcome to RoyalPark Privilege Club!",
        html: `
          <h2>Welcome to the Privilege Club</h2>
          <p>Your membership payment was successful.</p>
          <p>You can now use member discounts on bookings.</p>
        `,
      });
    }

    return res.status(201).json({
      success: true,
      message: isPaid
        ? "Subscribed successfully. Welcome email sent!"
        : "Subscription created. Payment pending.",
    });
  } catch (err) {
    console.error("Subscription Error:", err);

    if (err.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "Email already subscribed",
      });
    }

    return res.status(500).json({ message: "Server error" });
  }
});

router.get("/status", async (req, res) => {
  try {
    const email = String(req.query.email || "").trim().toLowerCase();
    if (!email) {
      return res.status(400).json({ active: false, message: "Email required" });
    }

    const member = await Subscriber.findOne({ email }).select(
      "membershipActive paymentStatus membershipFee paymentMethod"
    );

    return res.json({
      active: Boolean(member?.membershipActive),
      paymentStatus: member?.paymentStatus || "NONE",
      membershipFee: member?.membershipFee || 0,
      paymentMethod: member?.paymentMethod || "",
    });
  } catch (err) {
    console.error("Membership status error:", err);
    return res.status(500).json({ active: false, message: "Server error" });
  }
});

module.exports = router;
