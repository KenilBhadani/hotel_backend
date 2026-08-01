const mongoose = require("mongoose");
const Booking = require("../models/Booking");
const RoomListing = require("../models/RoomListing");

require("dotenv").config();

async function createTestBookings() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URI);
    console.log("Connected to MongoDB");

    // Get a room for testing
    const room = await RoomListing.findOne();
    if (!room) {
      console.log("No rooms found. Please create rooms first.");
      return;
    }

    // Create test bookings
    const testBookings = [
      {
        roomId: room._id,
        roomTitle: room.title,
        ratePerNight: room.pricing?.standardRate || 1000,
        firstName: "John",
        lastName: "Doe",
        email: "john@example.com",
        phone: "1234567890",
        nights: 2,
        subtotal: 2000,
        gstAmount: 360,
        totalAmount: 2360,
        checkIn: new Date(Date.now() + 24 * 60 * 60 * 1000), // Tomorrow
        checkOut: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000), // Day after tomorrow
        paymentStatus: "Paid",
        bookingStatus: "Confirmed",
      },
      {
        roomId: room._id,
        roomTitle: room.title,
        ratePerNight: room.pricing?.standardRate || 1000,
        firstName: "Jane",
        lastName: "Smith",
        email: "jane@example.com",
        phone: "0987654321",
        nights: 1,
        subtotal: 1000,
        gstAmount: 180,
        totalAmount: 1180,
        checkIn: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), // 2 days ago
        checkOut: new Date(Date.now() - 24 * 60 * 60 * 1000), // Yesterday
        paymentStatus: "Paid",
        bookingStatus: "Confirmed",
      },
      {
        roomId: room._id,
        roomTitle: room.title,
        ratePerNight: room.pricing?.standardRate || 1000,
        firstName: "Bob",
        lastName: "Wilson",
        email: "bob@example.com",
        phone: "5555555555",
        nights: 3,
        subtotal: 3000,
        gstAmount: 540,
        totalAmount: 3540,
        checkIn: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // Next week
        checkOut: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000), // 10 days from now
        paymentStatus: "Pending",
        bookingStatus: "Pending",
      },
    ];

    for (const bookingData of testBookings) {
      const booking = new Booking(bookingData);
      await booking.save();
      console.log(`Created booking for ${bookingData.firstName} ${bookingData.lastName}`);
    }

    console.log("Test bookings created successfully!");
  } catch (error) {
    console.error("Error creating test bookings:", error);
  } finally {
    await mongoose.disconnect();
    console.log("Disconnected from MongoDB");
  }
}

createTestBookings();
