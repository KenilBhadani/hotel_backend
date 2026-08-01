
const mongoose = require('mongoose');
const Booking = require('./models/Booking');
const RoomListing = require('./models/RoomListing');
const RoomInstance = require('./models/RoomInstance');
require('dotenv').config();

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/hotel_management';

async function runVerification() {
    try {
        await mongoose.connect(MONGO_URI);
        console.log('Connected to MongoDB');

        // 1. Setup: Create 1 Room
        const roomTitle = 'AVAILABILITY_TEST_' + Date.now();
        const room = await RoomListing.create({
            title: roomTitle,
            roomType: 'Single',
            totalRooms: 1,
            capacity: 2,
            bedType: 'Single',
            pricing: { standardRate: 100 },
            status: 'active'
        });
        
        // Create Instance
        const instance = await RoomInstance.create({
            roomListing: room._id,
            roomNumber: 'TEST-101',
            status: 'FREE'
        });

        // Helper to check availability
        const checkAvailability = async (label) => {
            const checkIn = new Date();
            const checkOut = new Date(new Date().setDate(new Date().getDate() + 1));
            
            // Logic from room.js
            const bookedCount = await Booking.countDocuments({
                roomId: room._id,
                bookingStatus: { $nin: ["Cancelled", "Checked-out"] },
                checkIn: { $lt: checkOut },
                checkOut: { $gt: checkIn }
            });
            const available = room.totalRooms - bookedCount;
            console.log(`[${label}] Available: ${available}`);
            return available;
        };

        // 2. Initial State
        await checkAvailability('Initial');

        // 3. Book the room
        const booking = await Booking.create({
            roomId: room._id,
            checkIn: new Date(),
            checkOut: new Date(new Date().setDate(new Date().getDate() + 1)),
            bookingStatus: 'Confirmed',
            firstName: 'Test',
            lastName: 'Guest',
            email: 'test@test.com',
            totalAmount: 100
        });
        await checkAvailability('After Booking'); // Should be 0

        // 4. Check In
        booking.bookingStatus = 'Checked-in';
        booking.assignedRoomInstance = instance._id;
        await booking.save();
        instance.status = 'STAY';
        await instance.save();
        await checkAvailability('After Check-in'); // Should be 0

        // 5. Check Out
        booking.bookingStatus = 'Checked-out';
        await booking.save();
        instance.status = 'CLEANING';
        await instance.save();
        await checkAvailability('After Check-out (Cleaning)'); // Should be 1 (because inventory logic)

        // 6. Mark Free
        instance.status = 'FREE';
        await instance.save();
        await checkAvailability('After Mark Free'); // Should be 1

        // Cleanup
        await Booking.deleteMany({ roomId: room._id });
        await RoomInstance.deleteMany({ roomListing: room._id });
        await RoomListing.findByIdAndDelete(room._id);

    } catch (err) {
        console.error(err);
    } finally {
        await mongoose.connection.close();
    }
}

runVerification();
