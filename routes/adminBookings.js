// routes/adminBookings.js
const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");

const Booking = require("../models/Booking");
const RoomListing = require("../models/RoomListing");
const authMiddleware = require("../middleware/auth"); // Make sure this file exists

// ======================
// Admin: Recent Bookings
// ======================
router.get("/recent-bookings", authMiddleware, async (req, res) => {
  try {
    // Only admins allowed
    if (req.user.role !== "admin") {
      return res.status(403).json({ error: "Admin access required" });
    }

    // Fetch bookings and populate room info
    const bookings = await Booking.find()
      .populate("roomId") // get room title and info
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

    // Format bookings for frontend
    const formatted = bookings.map((b) => ({
      _id: b._id,
      firstName: b.firstName,
      lastName: b.lastName,
      email: b.email,
      phone: b.phone,
      roomTitle: b.roomTitle || (b.roomId?.title || "—"),
      checkIn: b.checkIn,
      checkOut: b.checkOut,
      bookingStatus: b.bookingStatus,
      paymentStatus: b.paymentStatus,
      totalAmount: b.totalAmount,
      createdAt: b.createdAt,
    }));

    res.json({ bookings: formatted });
  } catch (err) {
    console.error("FETCH RECENT BOOKINGS ERROR:", err);
    res.status(500).json({ error: "Failed to fetch bookings" });
  }
});

// ======================
// Admin: Cancel Booking
// ======================
router.put("/:id/cancel", authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ error: "Admin access required" });
    }

    const bookingId = req.params.id;

    if (!mongoose.Types.ObjectId.isValid(bookingId)) {
      return res.status(400).json({ error: "Invalid booking ID" });
    }

    const booking = await Booking.findById(bookingId);
    if (!booking || booking.bookingStatus === "Cancelled") {
      return res.status(400).json({ error: "Booking not found or already cancelled" });
    }

    booking.bookingStatus = "Cancelled";
    await booking.save();

    res.json({ success: true, message: "Booking cancelled" });
  } catch (err) {
    console.error("CANCEL BOOKING ERROR:", err);
    res.status(500).json({ error: "Failed to cancel booking" });
  }
});

// ======================
// Admin: Check In Booking
// ======================
router.put("/:id/checkin", authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ error: "Admin access required" });
    }

    const bookingId = req.params.id;

    if (!mongoose.Types.ObjectId.isValid(bookingId)) {
      return res.status(400).json({ error: "Invalid booking ID" });
    }

    const booking = await Booking.findById(bookingId);
    if (!booking || booking.bookingStatus === "Cancelled") {
      return res.status(400).json({ error: "Booking not found or cancelled" });
    }

    if (booking.bookingStatus === "Checked-in") {
      return res.status(400).json({ error: "Booking already checked in" });
    }

    // Check if room is still available (in case of changes)
    const overlappingBookings = await Booking.countDocuments({
      roomId: booking.roomId,
      _id: { $ne: bookingId }, // Exclude current booking
      bookingStatus: { $nin: ["Cancelled", "Checked-out"] },
      checkIn: { $lt: booking.checkOut },
      checkOut: { $gt: booking.checkIn },
    });

    const room = await RoomListing.findById(booking.roomId);
    if (overlappingBookings >= room.totalRooms) {
      return res.status(400).json({ error: "No rooms available for check-in" });
    }

    booking.bookingStatus = "Checked-in";
    booking.actualCheckIn = new Date();
    await booking.save();

    res.json({ success: true, message: "Booking checked in successfully" });
  } catch (err) {
    console.error("CHECK IN BOOKING ERROR:", err);
    res.status(500).json({ error: "Failed to check in booking" });
  }
});

// ======================
// Admin: Check Out Booking
// ======================
router.put("/:id/checkout", authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ error: "Admin access required" });
    }

    const bookingId = req.params.id;

    if (!mongoose.Types.ObjectId.isValid(bookingId)) {
      return res.status(400).json({ error: "Invalid booking ID" });
    }

    const booking = await Booking.findById(bookingId);
    if (!booking || booking.bookingStatus === "Cancelled") {
      return res.status(400).json({ error: "Booking not found or cancelled" });
    }

    if (booking.bookingStatus !== "Checked-in") {
      return res.status(400).json({ error: "Booking is not checked in" });
    }

    booking.bookingStatus = "Checked-out";
    booking.actualCheckOut = new Date();
    await booking.save();

    // Update Room Instance to DIRTY status after checkout
    if (booking.assignedRoomInstance) {
      const RoomInstance = require('../models/RoomInstance');
      const roomInstance = await RoomInstance.findById(booking.assignedRoomInstance);
      if (roomInstance) {
        roomInstance.status = 'DIRTY';
        roomInstance.lastStatusUpdate = new Date();
        await roomInstance.save();
        console.log(`[ADMIN CHECKOUT] Room ${roomInstance.roomNumber} set to DIRTY`);
      }
    }

    res.json({ success: true, message: "Booking checked out successfully" });
  } catch (err) {
    console.error("CHECK OUT BOOKING ERROR:", err);
    res.status(500).json({ error: "Failed to check out booking" });
  }
});
module.exports = router;
