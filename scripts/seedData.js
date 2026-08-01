const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const RoomListing = require("../models/RoomListing");
const RoomInstance = require("../models/RoomInstance");
const Booking = require("../models/Booking");
const Staff = require("../models/Staff");
const Task = require("../models/Task");

require("dotenv").config();

async function seedData() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("Connected to MongoDB");

    /* -------- CLEAR DATA -------- */
    await RoomListing.deleteMany({});
    await RoomInstance.deleteMany({});
    await Booking.deleteMany({});
    await Staff.deleteMany({});
    await Task.deleteMany({});
    console.log("Cleared existing data");

    /* -------- ROOM LISTINGS -------- */
    const listings = [
      {
        title: "Deluxe Room",
        roomType: "Deluxe",
        capacity: 2,
        totalRooms: 5,
        pricing: { standardRate: 5000 },
        amenities: ["WiFi", "AC"],
        status: "active",
      },
      {
        title: "Standard Room",
        roomType: "Double",
        capacity: 2,
        totalRooms: 10,
        pricing: { standardRate: 3000 },
        amenities: ["WiFi"],
        status: "active",
      },
    ];

    const savedListings = await RoomListing.insertMany(listings);

    /* -------- ROOM INSTANCES -------- */
    const instances = [];

    for (const listing of savedListings) {
      for (let i = 1; i <= listing.totalRooms; i++) {
        instances.push({
          roomListing: listing._id,
          roomNumber: `${listing.roomType}-${i}`,
          status: "FREE",
        });
      }
    }

    const savedInstances = await RoomInstance.insertMany(instances);
    console.log("RoomInstances created");

    /* -------- STAFF -------- */
    const housekeeping = await Staff.create({
      staffId: "STF003",
      name: "Bob Housekeeping",
      email: "housekeeping@hotel.com",
      role: "Housekeeping",
      password: await bcrypt.hash("password123", 10),
    });

    /* -------- BOOKING (CHECKED-IN) -------- */
    const occupiedRoom = savedInstances.find(r => r.status === "FREE");

    occupiedRoom.status = "STAY";
    await occupiedRoom.save();

    const booking = await Booking.create({
      roomId: occupiedRoom.roomListing,
      roomInstance: occupiedRoom._id,
      bookingStatus: "Checked-in",
      firstName: "Raj",
      lastName: "Kumar",
      checkIn: new Date(Date.now() - 86400000),
      checkOut: new Date(Date.now() + 86400000),
    });

    console.log("Booking created & room occupied");

    /* -------- CHECK-OUT SIMULATION -------- */
    occupiedRoom.status = "CLEANING";
    await occupiedRoom.save();

    await Task.create({
      title: `Clean ${occupiedRoom.roomNumber}`,
      category: "Housekeeping",
      assignedTo: housekeeping._id,
      status: "Pending",
    });

    console.log("Housekeeping task created");

    console.log("\n✅ SEEDING COMPLETE");
  } catch (err) {
    console.error("Seed error:", err);
  } finally {
    await mongoose.disconnect();
  }
}

seedData();