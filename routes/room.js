const express = require("express");
const router = express.Router();

const RoomListing = require("../models/RoomListing");
const Booking = require("../models/Booking");
const RoomInstance = require("../models/RoomInstance");

/* =========================
   GET ALL ACTIVE ROOMS
   Guest / Reception
   /api/rooms
========================= */
router.get("/", async (req, res) => {
  try {
    const rooms = await RoomListing.find({ status: "active" }).lean();

    // Populate RoomInstances (roomNumbers) for frontend
    for (let room of rooms) {
      const instances = await RoomInstance.find({ roomListing: room._id }).lean();
      room.roomNumbers = instances;
    }

    res.json(Array.isArray(rooms) ? rooms : []);
  } catch (err) {
    console.error("Get rooms error:", err);
    res.json([]);
  }
});

/* =========================
   GET UNIQUE ROOM TYPES
   For dropdown filters
   /api/rooms/types
========================= */
router.get("/types", async (req, res) => {
  try {
    // Get distinct room types from active rooms
    const roomTypes = await RoomListing.distinct("roomType", { status: "active" });
    res.json(roomTypes);
  } catch (err) {
    console.error("Get room types error:", err);
    res.status(500).json([]);
  }
});

/* =========================
   GET AVAILABLE ROOMS (DATE-BASED)
   Guest booking flow
   /api/rooms/available
========================= */
router.get("/available", async (req, res) => {
  try {
    const { roomType, guests, checkIn, checkOut } = req.query;

    console.log("\n=== AVAILABLE ROOMS REQUEST ===");
    console.log("Raw query params:", req.query);
    console.log("Room Type received:", `"${roomType}"`, "(type:", typeof roomType, ")");
    console.log("Guests:", guests);
    console.log("Check In:", checkIn);
    console.log("Check Out:", checkOut);

    if (!checkIn || !checkOut) return res.json([]);

    const checkInDate = new Date(checkIn);
    const checkOutDate = new Date(checkOut);

    if (isNaN(checkInDate.getTime()) || isNaN(checkOutDate.getTime()) || checkInDate >= checkOutDate) {
      return res.json([]);
    }

    // Base query
    const roomQuery = { status: "active" };

    // Add room type filter if provided (not empty string)
    if (roomType && roomType.trim() !== "") {
      // Use exact match - frontend sends proper case
      roomQuery.roomType = roomType.trim();
      console.log("✅ Filtering by room type (exact match):", roomType.trim());
    } else {
      console.log("⚠️ No room type filter applied (roomType is empty or undefined)");
    }
    if (guests) roomQuery.capacity = { $gte: Number(guests) };

    console.log("Final Room Query:", JSON.stringify(roomQuery, null, 2));

    const rooms = await RoomListing.find(roomQuery).lean();
    console.log("=== QUERY RESULTS ===");
    console.log("Found rooms:", rooms.length);
    if (rooms.length > 0) {
      console.log("Room details:");
      rooms.forEach(r => {
        console.log(`  - Title: "${r.title}", Room Type: "${r.roomType}", Total Rooms: ${r.totalRooms}`);
      });
    }

    if (!rooms.length) return res.json([]);

    // Overlapping bookings
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
    const bookingMap = {};
    overlappingBookings.forEach(b => { bookingMap[b._id.toString()] = b.bookedCount; });

    // Attach roomNumbers and calculate availability
    const availableRooms = [];
    for (let room of rooms) {
      const bookedCount = bookingMap[room._id.toString()] || 0;

      // Count physically unavailable rooms (DIRTY, CLEANING, MAINTENANCE, STAY, REVIEW)
      // Only FREE, CLEAN, READY rooms can be assigned to new bookings
      const unavailableInstances = await RoomInstance.countDocuments({
        roomListing: room._id,
        status: { $in: ["DIRTY", "CLEANING", "MAINTENANCE", "STAY", "REVIEW"] }
      });

      // Available = Total - Active Bookings - Physically Unavailable (not already counted in bookings)
      // Use max to avoid negative numbers
      const physicallyAvailable = room.totalRooms - unavailableInstances;
      const availableCount = Math.max(0, physicallyAvailable - bookedCount);

      console.log(`\n--- Room: ${room.title} (${room.roomType}) ---`);
      console.log(`Total Rooms: ${room.totalRooms}`);
      console.log(`Booked Count (date overlap): ${bookedCount}`);
      console.log(`Unavailable Instances (DIRTY/CLEANING/etc): ${unavailableInstances}`);
      console.log(`Available Count: ${availableCount}`);

      if (availableCount <= 0) {
        console.log(`❌ Skipping ${room.title} - No availability`);
        continue;
      }

      const instances = await RoomInstance.find({ roomListing: room._id }).lean();
      room.roomNumbers = instances;
      console.log(`✅ Adding ${room.title} to available rooms`);

      availableRooms.push({
        ...room,
        availableRooms: availableCount,
      });
    }

    console.log("\n=== FINAL RESULTS ===");
    console.log("Returning available rooms:", availableRooms.length);
    console.log("Room types:", availableRooms.map(r => `${r.title} (${r.roomType})`));

    res.json(availableRooms);

  } catch (err) {
    console.error("Available rooms error:", err);
    res.json([]);
  }
});

module.exports = router;
