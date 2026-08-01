// =======================================
// HOTEL BOOKING SYSTEM BACKEND
// Dynamic Room Availability Implementation
// =======================================

require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const path = require("path");

// =======================================
// MONGOOSE MODELS
// =======================================

// Room Listing Model
const RoomListingSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    roomType: {
      type: String,
      enum: ["Single", "Double", "Deluxe", "Suite", "Family"],
      required: true,
    },
    size: Number,
    capacity: Number,
    bedType: String,
    totalRooms: {
      type: Number,
      required: true,
      min: 1,
    },
    images: [String],
    rates: {
      planName: String,
      inclusions: [String],
      depositPolicy: String,
    },
    pricing: {
      standardRate: { type: Number, default: 0 },
      currency: { type: String, default: "INR" },
    },
    amenities: [String],
    status: {
      type: String,
      enum: ["active", "inactive"],
      default: "active",
    },
  },
  { timestamps: true }
);

// Booking Model
const BookingSchema = new mongoose.Schema(
  {
    roomId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "RoomListing",
      required: true,
    },
    roomTitle: String,
    ratePerNight: Number,
    firstName: String,
    lastName: String,
    email: String,
    phone: String,
    gst: String,
    requests: String,
    nights: Number,
    subtotal: Number,
    gstAmount: Number,
    totalAmount: {
      type: Number,
      required: true,
    },
    checkIn: {
      type: Date,
      required: true,
    },
    checkOut: {
      type: Date,
      required: true,
    },
    paymentIntentId: String,
    paymentStatus: {
      type: String,
      enum: ["Paid", "Pending", "Cash"],
      default: "Pending",
    },
    bookingStatus: {
      type: String,
      enum: ["Pending", "Confirmed", "Checked-in", "Checked-out", "Cancelled"],
      default: "Pending",
    },
    actualCheckIn: Date,
    actualCheckOut: Date,
    history: [{
      action: String,
      by: { type: mongoose.Schema.Types.ObjectId, ref: "Staff" },
      note: String,
      createdAt: { type: Date, default: Date.now }
    }],
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  { timestamps: true }
);

// User Model (simplified for auth)
const UserSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  password: String,
  firstName: String,
  lastName: String,
  role: { type: String, enum: ["user", "admin"], default: "user" },
}, { timestamps: true });

// Register models
const RoomListing = mongoose.model("RoomListing", RoomListingSchema);
const Booking = mongoose.model("Booking", BookingSchema);
const User = mongoose.model("User", UserSchema);

// =======================================
// EXPRESS APP SETUP
// =======================================

const app = express();

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || "http://localhost:3000",
  credentials: true
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Static files
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// =======================================
// AUTHENTICATION MIDDLEWARE (Simplified)
// =======================================

const auth = (req, res, next) => {
  // Simplified auth - in production, verify JWT token
  const token = req.headers.authorization?.replace("Bearer ", "");
  if (!token) {
    return res.status(401).json({ error: "No token provided" });
  }

  try {
    // In production, verify JWT here
    // For now, assume token contains user info
    req.user = { userId: token, role: "user" };
    next();
  } catch (err) {
    res.status(401).json({ error: "Invalid token" });
  }
};

const isAdmin = (req, res, next) => {
  if (req.user?.role !== "admin") {
    return res.status(403).json({ error: "Admin access required" });
  }
  next();
};

// =======================================
// ROOM ROUTES
// =======================================

// GET /api/rooms - Get all active rooms
app.get("/api/rooms", async (req, res) => {
  try {
    const rooms = await RoomListing.find({ status: "active" });
    res.json(Array.isArray(rooms) ? rooms : []);
  } catch (err) {
    console.error("Get rooms error:", err);
    res.json([]);
  }
});

// GET /api/rooms/available - Get available rooms with computed availability
app.get("/api/rooms/available", async (req, res) => {
  try {
    const { roomType, guests, checkIn, checkOut } = req.query;

    // Validation
    if (!checkIn || !checkOut) return res.json([]);

    const checkInDate = new Date(checkIn);
    const checkOutDate = new Date(checkOut);

    if (
      isNaN(checkInDate.getTime()) ||
      isNaN(checkOutDate.getTime()) ||
      checkInDate >= checkOutDate
    ) {
      return res.json([]);
    }

    // Room type normalization
    const roomTypeMap = {
      single: "Single",
      double: "Double",
      deluxe: "Deluxe",
      suite: "Suite",
      family: "Family",
    };

    const normalizedRoomType = roomType && roomTypeMap[roomType.toLowerCase()];

    // Base room query
    const roomQuery = { status: "active" };
    if (normalizedRoomType) roomQuery.roomType = normalizedRoomType;
    if (guests) roomQuery.capacity = { $gte: Number(guests) };

    const rooms = await RoomListing.find(roomQuery);
    if (!rooms.length) return res.json([]);

    // Fetch overlapping bookings that block availability
    const overlappingBookings = await Booking.aggregate([
      {
        $match: {
          bookingStatus: { $nin: ["Cancelled", "Checked-out"] },
          checkIn: { $lt: checkOutDate },
          checkOut: { $gt: checkInDate },
        },
      },
      {
        $group: {
          _id: "$roomId",
          bookedCount: { $sum: 1 },
        },
      },
    ]);

    // Map bookings
    const bookingMap = {};
    overlappingBookings.forEach((b) => {
      bookingMap[b._id.toString()] = b.bookedCount;
    });

    // Calculate availability
    const availableRooms = rooms
      .map((room) => {
        if (typeof room.totalRooms !== "number") return null;

        const bookedCount = bookingMap[room._id.toString()] || 0;
        const availableCount = room.totalRooms - bookedCount;

        if (availableCount <= 0) return null;

        return {
          ...room.toObject(),
          availableRooms: availableCount, // Frontend expects this field
        };
      })
      .filter(Boolean);

    res.json(availableRooms);
  } catch (err) {
    console.error("Available rooms error:", err);
    res.json([]);
  }
});

// =======================================
// BOOKING ROUTES
// =======================================

// GET /api/bookings/my - Get user's bookings
app.get("/api/bookings/my", auth, async (req, res) => {
  try {
    const bookings = await Booking.find({
      $or: [
        { userId: req.user.userId },
        { email: req.user.email }
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

// POST /api/bookings/save - Create new booking with availability check
app.post("/api/bookings/save", auth, async (req, res) => {
  try {
    const {
      bookingData,
      roomId,
      ratePerNight,
      checkIn,
      checkOut,
      nights,
      subtotal,
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

    if (overlappingBookings >= room.totalRooms) {
      return res.status(400).json({ error: "No rooms available for the selected dates" });
    }

    // Create booking
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

// PUT /api/bookings/:id/cancel - Cancel booking
app.put("/api/bookings/:id/cancel", auth, async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id);
    if (!booking || booking.bookingStatus === "Cancelled") {
      return res.status(400).json({ error: "Invalid booking" });
    }

    booking.bookingStatus = "Cancelled";
    await booking.save();

    res.json({ success: true, message: "Booking cancelled" });
  } catch (err) {
    console.error("CANCEL ERROR:", err);
    res.status(500).json({ error: "Cancel failed" });
  }
});

// =======================================
// ADMIN BOOKING ROUTES
// =======================================

// GET /api/admin/bookings - Get all bookings (admin)
app.get("/api/admin/bookings", auth, isAdmin, async (req, res) => {
  try {
    const bookings = await Booking.find()
      .populate("roomId")
      .sort({ createdAt: -1 });
    res.json(bookings || []);
  } catch (err) {
    console.error("ADMIN BOOKINGS ERROR:", err);
    res.status(500).json({ error: "Failed to fetch bookings" });
  }
});

// PUT /api/admin/bookings/:id/checkin - Check in booking
app.put("/api/admin/bookings/:id/checkin", auth, isAdmin, async (req, res) => {
  try {
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

    // Check if room is still available
    const overlappingBookings = await Booking.countDocuments({
      roomId: booking.roomId,
      _id: { $ne: bookingId },
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

// PUT /api/admin/bookings/:id/checkout - Check out booking
app.put("/api/admin/bookings/:id/checkout", auth, isAdmin, async (req, res) => {
  try {
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
      const roomInstance = await RoomInstance.findById(booking.assignedRoomInstance);
      if (roomInstance) {
        roomInstance.status = 'DIRTY';
        roomInstance.lastStatusUpdate = new Date();
        await roomInstance.save();
        console.log(`[CHECKOUT] Room ${roomInstance.roomNumber} set to DIRTY`);
      }
    }

    res.json({ success: true, message: "Booking checked out successfully" });
  } catch (err) {
    console.error("CHECK OUT BOOKING ERROR:", err);
    res.status(500).json({ error: "Failed to check out booking" });
  }
});

// =======================================
// ADMIN ROOM ROUTES
// =======================================

// GET /api/admin/rooms - Get all rooms (admin)
app.get("/api/admin/rooms", auth, isAdmin, async (req, res) => {
  try {
    const rooms = await RoomListing.find().sort({ createdAt: -1 });
    // Map totalRooms to availableRooms for frontend compatibility
    const roomsWithAvailable = rooms.map(room => ({
      ...room.toObject(),
      availableRooms: room.totalRooms
    }));
    res.json(roomsWithAvailable);
  } catch (err) {
    console.error("ADMIN GET ROOMS ERROR:", err);
    res.status(500).json({ message: "Failed to load rooms" });
  }
});

// POST /api/admin/rooms - Create room (admin)
app.post("/api/admin/rooms", auth, isAdmin, async (req, res) => {
  try {
    const {
      title,
      description,
      roomType,
      size,
      capacity,
      bedType,
      totalRooms,
      availableRooms, // Frontend sends this, treat as totalRooms
      amenities,
      planName,
      inclusions,
      depositPolicy,
      standardRate,
      currency,
    } = req.body;

    // Validation
    if (
      !title ||
      !roomType ||
      !capacity ||
      !bedType ||
      !(totalRooms || availableRooms) ||
      !standardRate
    ) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    const room = await RoomListing.create({
      title,
      description,
      roomType,
      size: size ? Number(size) : undefined,
      capacity: Number(capacity),
      bedType,
      totalRooms: Number(totalRooms || availableRooms),
      images: [],
      amenities: amenities ? amenities.split(",").map(a => a.trim()) : [],
      rates: {
        planName: planName || "Standard Plan",
        inclusions: inclusions ? inclusions.split(",").map(i => i.trim()) : [],
        depositPolicy,
      },
      pricing: {
        standardRate: Number(standardRate),
        currency: currency || "INR",
      },
      status: "active",
    });

    res.status(201).json(room);
  } catch (err) {
    console.error("ADMIN CREATE ROOM ERROR:", err);
    res.status(500).json({ message: err.message });
  }
});

// =======================================
// DATABASE CONNECTION & SERVER START
// =======================================

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URI || "mongodb://localhost:27017/hotel-booking")
  .then(() => {
    console.log("✅ MongoDB connected");
  })
  .catch(err => {
    console.error("❌ MongoDB connection error:", err);
    process.exit(1);
  });

// Health check
app.get("/", (req, res) => res.send("✅ Hotel Booking API running"));

// 404 handler
app.use("/api/*", (req, res) => res.status(404).json({ error: "API route not found" }));

// Global error handler
app.use((err, req, res, next) => {
  console.error("❌ Server Error:", err);
  res.status(500).json({ error: "Internal Server Error" });
});

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Hotel Booking Server running on http://localhost:${PORT}`);
  console.log(`📅 Current Date: ${new Date().toISOString().split('T')[0]}`);
});

module.exports = app;