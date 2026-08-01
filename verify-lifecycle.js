
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

        // 1. Cleanup previous test data
        await RoomListing.deleteMany({ title: 'TEST_ROOM_LIFECYCLE' });
        // Clean up any orphan instances/bookings from previous runs if needed (optional)

        // 2. Create Room Type (Admin)
        console.log('\n--- 1. Creating Room Type ---');
        const room = await RoomListing.create({
            title: 'TEST_ROOM_LIFECYCLE',
            roomType: 'Single',
            totalRooms: 2,
            capacity: 2,
            bedType: 'Single',
            pricing: { standardRate: 100 },
            status: 'active'
        });
        console.log('Room Created:', room._id);

        // 3. Create Physical Instances (Mocking what createRoomInstancesForListing does)
        console.log('\n--- 2. Creating Instances ---');
        const instances = [
            { roomListing: room._id, roomNumber: 'T-101', status: 'FREE' },
            { roomListing: room._id, roomNumber: 'T-102', status: 'FREE' }
        ];
        await RoomInstance.insertMany(instances);
        console.log('Instances Created: T-101, T-102');

        // 4. Check Availability (Inventory)
        // Mocking logic from /api/rooms/available
        console.log('\n--- 3. Checking Inventory ---');
        const checkIn = new Date();
        const checkOut = new Date(new Date().setDate(new Date().getDate() + 1));
        
        const bookedCount = await Booking.countDocuments({
            roomId: room._id,
            bookingStatus: { $nin: ["Cancelled", "Checked-out"] },
            checkIn: { $lt: checkOut },
            checkOut: { $gt: checkIn }
        });
        const available = room.totalRooms - bookedCount;
        console.log(`Total: ${room.totalRooms}, Booked: ${bookedCount}, Available: ${available}`);
        if (available !== 2) throw new Error('Availability calculation wrong');

        // 5. Create Booking
        console.log('\n--- 4. Creating Booking ---');
        const booking = await Booking.create({
            roomId: room._id,
            checkIn,
            checkOut,
            bookingStatus: 'Confirmed',
            firstName: 'Test',
            lastName: 'User',
            email: 'test@example.com',
            totalAmount: 112,
            subtotal: 100,
            gstAmount: 12,
            nights: 1,
            ratePerNight: 100
        });
        console.log('Booking Created:', booking._id);

        // 6. Check Availability Again
        const bookedCount2 = await Booking.countDocuments({
            roomId: room._id,
            bookingStatus: { $nin: ["Cancelled", "Checked-out"] },
            checkIn: { $lt: checkOut },
            checkOut: { $gt: checkIn }
        });
        console.log(`New Availability: ${room.totalRooms - bookedCount2}`);
        if ((room.totalRooms - bookedCount2) !== 1) throw new Error('Availability did not decrease');

        // 7. Check-in (Reception)
        console.log('\n--- 5. Check-in ---');
        // Logic from staffRooms.js /check-in
        let roomInstance = await RoomInstance.findOne({
            roomListing: room._id,
            status: { $in: ['FREE', 'CLEAN'] }
        });
        if (!roomInstance) throw new Error('No room found for check-in');
        
        booking.bookingStatus = 'Checked-in';
        booking.assignedRoomInstance = roomInstance._id;
        booking.assignedRoomNumber = roomInstance.roomNumber;
        await booking.save();
        
        roomInstance.status = 'STAY';
        await roomInstance.save();
        console.log(`Checked in to ${roomInstance.roomNumber}. Status: ${roomInstance.status}`);

        // 8. Check-out (Reception)
        console.log('\n--- 6. Check-out ---');
        booking.bookingStatus = 'Checked-out';
        await booking.save();
        
        roomInstance.status = 'CLEANING';
        await roomInstance.save();
        console.log(`Checked out. Room ${roomInstance.roomNumber} Status: ${roomInstance.status}`);

        // 9. Housekeeping (Clean)
        console.log('\n--- 7. Housekeeping Clean ---');
        roomInstance.status = 'CLEAN';
        await roomInstance.save();
        console.log(`Room Cleaned. Status: ${roomInstance.status}`);

        // 10. Housekeeping (Release to Free)
        console.log('\n--- 8. Release to Free ---');
        roomInstance.status = 'FREE';
        await roomInstance.save();
        console.log(`Room Released. Status: ${roomInstance.status}`);

        console.log('\n✅ VERIFICATION SUCCESSFUL');

    } catch (err) {
        console.error('\n❌ VERIFICATION FAILED:', err);
    } finally {
        await mongoose.connection.close();
    }
}

runVerification();
