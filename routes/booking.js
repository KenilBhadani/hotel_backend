// backend/routes/booking.js
const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

const Booking = require("../models/Booking");
const RoomListing = require("../models/RoomListing");
const User = require("../models/User");
const auth = require("../middleware/auth");       // token/session login
const isAdmin = require("../middleware/isAdmin"); // admin middleware
const verifyStaff = require("../middleware/verifyStaff");

// =========================
// GET BOOKINGS - MY BOOKINGS
// =========================
router.get("/my", auth, async (req, res) => {
  try {
    console.log("User fetching My Bookings:", req.user);

    // Get the logged-in user's email
    const user = await User.findById(req.user.userId);
    if (!user) return res.status(404).json({ error: "User not found" });

    // Convert string userId to ObjectId for MongoDB
    const userObjectId = new mongoose.Types.ObjectId(req.user.userId);

    // Fetch bookings where userId matches OR email matches (for legacy bookings without userId)
    const bookings = await Booking.find({
      $or: [
        { userId: userObjectId },
        { email: user.email }
      ]
    })
      .populate("roomId")
      .sort({ createdAt: -1 });

    res.json(bookings || []);
  } catch (err) {
    console.error("MY BOOKINGS ERROR:", err);
    res.status(500).json({ error: "Failed to fetch bookings" });
  }
});

// =========================
// GET BOOKINGS - GUEST BY EMAIL
// =========================
router.get("/guest", async (req, res) => {
  try {
    const { email } = req.query;
    if (!email) return res.status(400).json({ error: "Email required" });

    const bookings = await Booking.find({ email })
      .populate("roomId")
      .sort({ createdAt: -1 });

    res.json(bookings || []);
  } catch (err) {
    console.error("GUEST BOOKINGS ERROR:", err);
    res.status(500).json({ error: "Failed to fetch guest bookings" });
  }
});

// =========================
// ADMIN BOOKINGS
// =========================
router.get("/admin", auth, isAdmin, async (req, res) => {
  try {
    const bookings = await Booking.find()
      .populate("roomId")
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();
    res.json(bookings || []);
  } catch (err) {
    console.error("ADMIN BOOKINGS ERROR:", err);
    res.status(500).json({ error: "Failed to fetch bookings" });
  }
});

// =========================
// STAFF TASKS
// =========================
router.get("/staff/tasks", verifyStaff, async (req, res) => {
  try {
    const tasks = await Booking.find({ assignedStaff: req.user.userId })
      .populate("roomId")
      .sort({ createdAt: -1 });
    res.json(tasks || []);
  } catch (err) {
    console.error("STAFF TASKS ERROR:", err);
    res.status(500).json({ error: "Failed to fetch staff tasks" });
  }
});

// =========================
// SAVE BOOKING
// =========================
router.post("/save", auth, async (req, res) => {
  try {
    const {
      bookingData,
      roomId,
      ratePerNight,
      checkIn,
      checkOut,
      nights,
      subtotal,
      discountPercent = 0,
      discountAmount = 0,
      gst,
      amount,
      paymentIntentId,
    } = req.body;

    // Validate required fields
    if (!roomId || !checkIn || !checkOut) {
      return res.status(400).json({ error: "Missing required booking data" });
    }

    const checkInDate = new Date(checkIn);
    const checkOutDate = new Date(checkOut);

    if (isNaN(checkInDate.getTime()) || isNaN(checkOutDate.getTime()) || checkInDate >= checkOutDate) {
      return res.status(400).json({ error: "Invalid check-in/check-out dates" });
    }

    // Check room availability
    const room = await RoomListing.findById(roomId);
    if (!room) {
      return res.status(404).json({ error: "Room not found" });
    }

    // Count overlapping bookings that block availability
    const overlappingBookings = await Booking.countDocuments({
      roomId,
      bookingStatus: { $nin: ["Cancelled", "Checked-out"] },
      checkIn: { $lt: checkOutDate },
      checkOut: { $gt: checkInDate },
    });

    // Count physically unavailable rooms (DIRTY, CLEANING, MAINTENANCE, STAY, REVIEW)
    const RoomInstance = require("../models/RoomInstance");
    const unavailableInstances = await RoomInstance.countDocuments({
      roomListing: roomId,
      status: { $in: ["DIRTY", "CLEANING", "MAINTENANCE", "STAY", "REVIEW"] }
    });

    const physicallyAvailable = room.totalRooms - unavailableInstances;
    const actualAvailable = Math.max(0, physicallyAvailable - overlappingBookings);

    if (actualAvailable <= 0) {
      return res.status(400).json({ error: "No rooms available for the selected dates" });
    }

    const booking = new Booking({
      roomId,
      roomTitle: room?.title || "",
      ratePerNight,
      firstName: bookingData.firstName,
      lastName: bookingData.lastName,
      email: bookingData.email,
      phone: bookingData.phone,
      gst: bookingData.gst,
      requests: bookingData.requests,
      nights,
      subtotal,
      discountPercent: Number(discountPercent) || 0,
      discountAmount: Number(discountAmount) || 0,
      gstAmount: gst,
      totalAmount: amount,
      checkIn: checkInDate,
      checkOut: checkOutDate,
      paymentIntentId,
      paymentStatus: paymentIntentId ? "Paid" : "Cash",
      bookingStatus: "Confirmed",
      userId: req.user?.userId || null,
    });

    await booking.save();
    res.json({ success: true, booking });
  } catch (err) {
    console.error("SAVE BOOKING ERROR:", err);
    res.status(500).json({ error: "Booking save failed" });
  }
});

// =========================
// CANCEL BOOKING
// =========================
router.put("/:id/cancel", auth, async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id);
    if (!booking || booking.bookingStatus === "Cancelled")
      return res.status(400).json({ error: "Invalid booking" });

    // 1. Update booking status
    booking.bookingStatus = "Cancelled";
    await booking.save();

    // 2. If a physical room was assigned, free it up
    // Note: We need to import RoomInstance at the top
    const RoomInstance = require("../models/RoomInstance");

    if (booking.assignedRoomInstance) {
      const roomInstance = await RoomInstance.findById(booking.assignedRoomInstance);
      if (roomInstance) {
        // Only reset if it's currently occupied (STAY) or Reserved
        // If it's already DIRTY or MAINTENANCE, maybe keep it?
        // But usually cancellation means nobody stayed, so it should go back to FREE.
        if (roomInstance.status === 'STAY') {
          roomInstance.status = 'FREE';
          roomInstance.assignedTo = null; // Clear staff assignment if any
          await roomInstance.save();
        }
      }
    }

    res.json({ success: true, message: "Booking cancelled" });
  } catch (err) {
    console.error("CANCEL ERROR:", err);
    res.status(500).json({ error: "Cancel failed" });
  }
});

// =========================
// VERIFY PAYMENT
// =========================
router.post("/verify-payment", async (req, res) => {
  try {
    const { paymentIntentId } = req.body;

    const booking = await Booking.findOne({ paymentIntentId });
    if (!booking) return res.status(404).json({ error: "Booking not found" });

    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

    if (!["succeeded", "processing"].includes(paymentIntent.status))
      return res.status(400).json({ error: `Payment status: ${paymentIntent.status}` });

    booking.paymentStatus = paymentIntent.status === "succeeded" ? "Paid" : "Pending";
    await booking.save();

    res.json({ success: true, status: paymentIntent.status });
  } catch (err) {
    console.error("VERIFY PAYMENT ERROR:", err);
    res.status(500).json({ error: "Payment verification failed" });
  }
});

module.exports = router;
