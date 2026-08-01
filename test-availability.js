const mongoose = require('mongoose');
require('dotenv').config();

async function testAvailability() {
  await mongoose.connect(process.env.MONGO_URI);

  const Booking = require('./models/Booking');
  const RoomListing = require('./models/RoomListing');

  // Create test data
  const room = await RoomListing.findOne();
  if (!room) {
    console.log('No rooms found, skipping test');
    return;
  }

  console.log(`Testing room: ${room.title}, totalRooms: ${room.totalRooms}`);

  // Count overlapping bookings
  const testCheckIn = new Date('2026-01-26');
  const testCheckOut = new Date('2026-01-28');

  const overlappingBookings = await Booking.countDocuments({
    roomId: room._id,
    bookingStatus: { $nin: ["Cancelled", "Checked-out"] },
    checkIn: { $lt: testCheckOut },
    checkOut: { $gt: testCheckIn },
  });

  const available = room.totalRooms - overlappingBookings;
  console.log(`Overlapping bookings: ${overlappingBookings}, Available: ${available}`);

  process.exit(0);
}

testAvailability().catch(err => {
  console.error(err);
  process.exit(1);
});