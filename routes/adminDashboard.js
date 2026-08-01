const express = require("express");
const router = express.Router();
const Booking = require("../models/Booking");
const Room = require("../models/RoomListing");
const RoomInstance = require("../models/RoomInstance");
const auth = require("../middleware/auth");
const isAdmin = require("../middleware/isAdmin");

/* =====================================================
   DASHBOARD OVERVIEW
   - Total Bookings
   - Rooms Available (quantity based)
===================================================== */
router.get("/overview", auth, isAdmin, async (req, res) => {
  try {
    const { month } = req.query;

    let dateFilter = {};
    if (month) {
      const start = new Date(`${month}-01`);
      const end = new Date(start);
      end.setMonth(end.getMonth() + 1);
      dateFilter = { createdAt: { $gte: start, $lt: end } };
    }

    /* TOTAL BOOKINGS */
    const totalBookings = await Booking.countDocuments(dateFilter);

    /* ACTIVE ROOMS (INVENTORY AVAILABILITY) */
    // User wants to see "Inventory Available" (Total Physical - Active Bookings)
    // This accounts for rooms reserved for today but not checked-in yet.
    const now = new Date();
    
    // 1. Total Physical Rooms
    const totalPhysicalRooms = await RoomInstance.countDocuments({});

    // 2. Active Bookings (Inventory overlap)
    const activeBookings = await Booking.countDocuments({
      checkIn: { $lte: now },
      checkOut: { $gt: now },
      bookingStatus: { $nin: ["Cancelled", "Checked-out"] }
    });

    const roomsAvailable = Math.max(0, totalPhysicalRooms - activeBookings);

    res.json({
      totalBookings,
      roomsAvailable,
    });
  } catch (err) {
    console.error("OVERVIEW ERROR:", err);
    res.status(500).json({ message: "Failed to load overview" });
  }
});

/* =====================================================
   STATS
   - Monthly Revenue
   - Occupancy %
===================================================== */
router.get("/stats", auth, isAdmin, async (req, res) => {
  try {
    const now = new Date();
    const startMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    /* ACTIVE ROOMS */
    const rooms = await Room.find({ status: "active" });

    /* TOTAL ROOM CAPACITY */
    const totalRoomQty = rooms.reduce(
      (sum, r) => sum + (r.totalRooms || 0),
      0
    );

    /* TOTAL BOOKED ROOMS - CURRENTLY OCCUPIED ONLY */
    const bookedAgg = await Booking.aggregate([
      {
        $match: {
          bookingStatus: { $nin: ["Cancelled", "Checked-out"] },
          checkIn: { $lte: now },
          checkOut: { $gt: now }
        },
      },
      {
        $group: {
          _id: null,
          totalBooked: { $sum: "$roomsBooked" },
        },
      },
    ]);

    const bookedRooms = bookedAgg[0]?.totalBooked || 0;

    /* OCCUPANCY */
    // Occupancy based on physical status
    const occupiedCount = await RoomInstance.countDocuments({ status: "STAY" });
    const totalPhysicalRooms = await RoomInstance.countDocuments({});

    const occupancy =
      totalPhysicalRooms > 0
        ? Math.round((occupiedCount / totalPhysicalRooms) * 100)
        : 0;

    /* MONTHLY REVENUE */
    const revenueAgg = await Booking.aggregate([
      {
        $match: {
          bookingStatus: { $ne: "Cancelled" },
          createdAt: { $gte: startMonth },
        },
      },
      {
        $group: {
          _id: null,
          total: {
            $sum: {
              $ifNull: ["$totalAmount", "$amount"],
            },
          },
        },
      },
    ]);

    res.json({
      revenueMonth: revenueAgg[0]?.total || 0,
      occupancy,
    });
  } catch (err) {
    console.error("STATS ERROR:", err);
    res.status(500).json({ message: "Failed to load stats" });
  }
});

/* =====================================================
   TRENDS
   - Daily Bookings
   - Daily Revenue
===================================================== */
router.get("/trends", auth, isAdmin, async (req, res) => {
  try {
    const days = Number(req.query.days) || 30;
    const start = new Date();
    start.setDate(start.getDate() - days);

    const bookings = await Booking.aggregate([
      { $match: { createdAt: { $gte: start } } },
      {
        $group: {
          _id: {
            $dateToString: { format: "%Y-%m-%d", date: "$createdAt" },
          },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    const revenue = await Booking.aggregate([
      {
        $match: {
          createdAt: { $gte: start },
          bookingStatus: { $ne: "Cancelled" },
        },
      },
      {
        $group: {
          _id: {
            $dateToString: { format: "%Y-%m-%d", date: "$createdAt" },
          },
          total: {
            $sum: {
              $ifNull: ["$totalAmount", "$amount"],
            },
          },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    res.json({ bookings, revenue });
  } catch (err) {
    console.error("TRENDS ERROR:", err);
    res.status(500).json({ message: "Failed to load trends" });
  }
});

/* =====================================================
   RECENT BOOKINGS
===================================================== */
router.get("/recent-bookings", auth, isAdmin, async (req, res) => {
  try {
    const limit = Number(req.query.limit) || 6;

    const bookings = await Booking.find({
      bookingStatus: { $ne: "Cancelled" },
    })
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate("roomId", "title roomType");

    const formatted = bookings.map((b) => ({
      _id: b._id,
      guestName: `${b.firstName || ""} ${b.lastName || ""}`.trim(),
      roomName: b.roomId?.title || "—",
      roomType: b.roomId?.roomType || "—",
      checkIn: b.checkIn,
      checkOut: b.checkOut,
      bookingStatus: b.bookingStatus,
    }));

    res.json({ bookings: formatted });
  } catch (err) {
    console.error("RECENT BOOKINGS ERROR:", err);
    res.status(500).json({ bookings: [] });
  }
});

/* =====================================================
   BOOKING STATUS DISTRIBUTION
===================================================== */
router.get("/bookings/status-distribution", auth, isAdmin, async (req, res) => {
  try {
    const data = await Booking.aggregate([
      {
        $group: {
          _id: "$bookingStatus",
          count: { $sum: 1 },
        },
      },
    ]);

    const result = {};
    data.forEach((d) => {
      result[d._id] = d.count;
    });

    res.json(result);
  } catch (err) {
    console.error("STATUS DIST ERROR:", err);
    res.status(500).json({ message: "Failed to load distribution" });
  }
});

module.exports = router;
