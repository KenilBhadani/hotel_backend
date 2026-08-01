const express = require("express");
const router = express.Router();

const RoomListing = require("../models/RoomListing");
const RoomInstance = require("../models/RoomInstance");
const Booking = require("../models/Booking");

/* =========================
   GET ALL ACTIVE ROOMS
   Guest / Reception
   /api/rooms
========================= */
router.get("/", async (req, res) => {
  try {
    const rooms = await RoomListing.find({ status: "active" }).lean();

    // Attach RoomInstances for frontend
    for (let room of rooms) {
      const instances = await RoomInstance.find({ roomListing: room._id }).lean();
      room.roomNumbers = instances;
    }

    res.json(rooms);
  } catch (err) {
    console.error("Get rooms error:", err);
    res.status(500).json([]);
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
    console.log("Is roomType empty string?", roomType === "");
    console.log("Is roomType undefined?", roomType === undefined);
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
        console.log(`  - Title: "${r.title}"`);
        console.log(`    Room Type: "${r.roomType}" (length: ${r.roomType.length})`);
        console.log(`    Room Type bytes:`, Buffer.from(r.roomType).toString('hex'));
        console.log(`    Total Rooms: ${r.totalRooms}`);
        console.log(`    Status: ${r.status}`);
      });
    } else {
      console.log("❌ No rooms found matching the query!");
      console.log("Query was:", JSON.stringify(roomQuery, null, 2));

      // Let's check what Twin rooms exist in database
      const allTwinRooms = await RoomListing.find({
        status: "active",
        roomType: /twin/i
      }).lean();
      console.log("All Twin-like rooms in database:", allTwinRooms.length);
      allTwinRooms.forEach(r => {
        console.log(`  - "${r.title}" has roomType: "${r.roomType}"`);
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
        $group: { _id: "$roomId", bookedCount: { $sum: 1 } },
      },
    ]);
    const bookingMap = {};
    overlappingBookings.forEach(b => { bookingMap[b._id.toString()] = b.bookedCount; });

    // Occupied / Cleaning RoomInstances
    const occupiedRooms = await RoomInstance.aggregate([
      { $match: { status: { $in: ["STAY", "CLEANING"] } } },
      { $group: { _id: "$roomListing", occupiedCount: { $sum: 1 } } },
    ]);
    const occupiedMap = {};
    occupiedRooms.forEach(r => { occupiedMap[r._id.toString()] = r.occupiedCount; });

    // Attach roomNumbers and calculate availability
    const availableRooms = [];
    for (let room of rooms) {
      const bookedCount = bookingMap[room._id.toString()] || 0;
      const occupiedCount = occupiedMap[room._id.toString()] || 0;
      const availableCount = room.totalRooms - bookedCount - occupiedCount;

      console.log(`\n--- Room: ${room.title} (${room.roomType}) ---`);
      console.log(`Total Rooms: ${room.totalRooms}`);
      console.log(`Booked Count: ${bookedCount}`);
      console.log(`Occupied Count: ${occupiedCount}`);
      console.log(`Available Count: ${availableCount}`);

      if (availableCount <= 0) {
        console.log(`❌ Skipping ${room.title} - No availability`);
        continue;
      }

      const instances = await RoomInstance.find({ roomListing: room._id }).lean();
      room.roomNumbers = instances;
      console.log(`✅ Adding ${room.title} to available rooms`);

      availableRooms.push({ ...room, availableRooms: availableCount });
    }

    console.log("Returning available rooms:", availableRooms.length);
    console.log("Available room types:", availableRooms.map(r => ({ title: r.title, roomType: r.roomType })));

    res.json(availableRooms);
  } catch (err) {
    console.error("Available rooms error:", err);
    res.status(500).json([]);
  }
});

/* =========================
   ADD NEW ROOM LISTING
   Admin only
   /api/rooms/add
========================= */
router.post("/add", async (req, res) => {
  try {
    const { title, roomType, totalRooms, description, capacity } = req.body;

    if (!title || !roomType || !totalRooms) {
      return res.status(400).json({ message: "Title, roomType and totalRooms are required" });
    }

    // Create RoomListing
    const newRoom = new RoomListing({ title, roomType, totalRooms, description, capacity });
    const savedRoom = await newRoom.save();

    // Create RoomInstances
    const roomInstances = [];
    for (let i = 1; i <= totalRooms; i++) {
      roomInstances.push({
        roomListing: savedRoom._id,
        roomNumber: `${i}`.padStart(3, "0"),
        status: "FREE",
      });
    }
    await RoomInstance.insertMany(roomInstances);

    res.status(201).json({ message: "Room listing and instances created", room: savedRoom });
  } catch (err) {
    console.error("Add room error:", err);
    res.status(500).json({ message: "Failed to create room" });
  }
});

/* =========================
   EDIT ROOM LISTING
   Admin only
   /api/rooms/edit/:id
========================= */
router.put("/edit/:id", async (req, res) => {
  try {
    const room = await RoomListing.findById(req.params.id);
    if (!room) return res.status(404).json({ message: "Room not found" });

    const prevTotal = room.totalRooms;
    Object.assign(room, req.body);
    await room.save();

    const diff = room.totalRooms - prevTotal;

    if (diff > 0) {
      // Add new instances
      const newInstances = [];
      for (let i = prevTotal + 1; i <= room.totalRooms; i++) {
        newInstances.push({
          roomListing: room._id,
          roomNumber: `${i}`.padStart(3, "0"),
          status: "FREE",
        });
      }
      await RoomInstance.insertMany(newInstances);
    } else if (diff < 0) {
      // Remove extra FREE instances only
      await RoomInstance.deleteMany({ roomListing: room._id, status: "FREE" }).limit(Math.abs(diff));
    }

    res.json({ message: "Room updated", room });
  } catch (err) {
    console.error("Edit room error:", err);
    res.status(500).json({ message: "Failed to update room" });
  }
});

/* =========================
   DELETE ROOM LISTING
   Admin only
   /api/rooms/delete/:id
========================= */
router.delete("/delete/:id", async (req, res) => {
  try {
    const room = await RoomListing.findById(req.params.id);
    if (!room) return res.status(404).json({ message: "Room not found" });

    // Delete associated RoomInstances
    await RoomInstance.deleteMany({ roomListing: room._id });

    await room.deleteOne();
    res.json({ message: "Room listing and instances deleted" });
  } catch (err) {
    console.error("Delete room error:", err);
    res.status(500).json({ message: "Failed to delete room" });
  }
});

module.exports = router;
