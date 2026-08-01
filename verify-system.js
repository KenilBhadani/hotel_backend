const mongoose = require('mongoose');
const RoomListing = require('./models/RoomListing');
const RoomInstance = require('./models/RoomInstance');
const Booking = require('./models/Booking');
const User = require('./models/User');
const Staff = require('./models/Staff');
require('dotenv').config();

const MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/hotel_management";

async function verifySystem() {
    console.log("🔍 Starting System Verification...");
    
    try {
        await mongoose.connect(MONGO_URI);
        console.log("✅ MongoDB Connected");

        // 1. Cleanup previous test data
        const testTitle = "VERIFY_TEST_ROOM";
        await RoomListing.deleteMany({ title: testTitle });
        // We also need to clean up instances and bookings related to this test
        // This is a simplified cleanup for the script
        console.log("🧹 Cleanup complete");

        // 2. Create a Room Listing (Admin)
        console.log("🏗️ Creating Room Listing...");
        const roomListing = await RoomListing.create({
            title: testTitle,
            roomType: "Deluxe",
            totalRooms: 2,
            capacity: 2,
            bedType: "Queen",
            pricing: { standardRate: 1000, currency: "INR" },
            status: "active"
        });
        console.log(`✅ Room Listing Created: ${roomListing._id}`);

        // 3. Verify Room Instances Creation (Triggered by Admin route usually, but here we simulate or check if logic exists)
        // Since the admin route handles instance creation, and we are running a script, we must manually invoke the util or check logic.
        // For this test script, we will simulate the util behavior to ensure the database constraints are fine.
        const createRoomInstances = require('./utils/createRoomInstances');
        await createRoomInstances(roomListing._id, roomListing.totalRooms);
        
        const instances = await RoomInstance.find({ roomListing: roomListing._id });
        if (instances.length !== 2) throw new Error(`Expected 2 instances, found ${instances.length}`);
        console.log(`✅ Verified 2 Room Instances created: ${instances.map(i => i.roomNumber).join(', ')}`);

        // 4. Create a Booking (Guest)
        console.log("📅 Creating Booking...");
        const checkIn = new Date();
        const checkOut = new Date(Date.now() + 86400000); // Tomorrow
        
        const booking = await Booking.create({
            roomId: roomListing._id,
            totalAmount: 1000,
            checkIn: checkIn,
            checkOut: checkOut,
            firstName: "Test",
            lastName: "Guest",
            email: "test@guest.com",
            bookingStatus: "Confirmed",
            paymentStatus: "Paid"
        });
        console.log(`✅ Booking Created: ${booking._id}`);

        // 5. Check Availability Logic (Guest)
        // Simulate the availability query
        const activeBookings = await Booking.countDocuments({
            roomId: roomListing._id,
            bookingStatus: { $in: ['Confirmed', 'Checked-in'] },
            checkIn: { $lt: checkOut },
            checkOut: { $gt: checkIn }
        });
        const availableCount = roomListing.totalRooms - activeBookings;
        if (availableCount !== 1) throw new Error(`Expected 1 available room, calculated ${availableCount}`);
        console.log("✅ Availability Logic Verified (1 room left)");

        // 6. Check-in (Reception)
        console.log("🏨 Performing Check-in...");
        // Logic from staffRooms.js /check-in
        let assignedInstance = instances.find(i => i.status === 'FREE');
        if (!assignedInstance) throw new Error("No free room found for check-in");
        
        booking.bookingStatus = 'Checked-in';
        booking.assignedRoomInstance = assignedInstance._id;
        booking.assignedRoomNumber = assignedInstance.roomNumber;
        await booking.save();
        
        assignedInstance.status = 'STAY';
        await assignedInstance.save();
        console.log(`✅ Guest Checked-in to Room ${assignedInstance.roomNumber}`);

        // 7. Check-out (Reception)
        console.log("👋 Performing Check-out...");
        booking.bookingStatus = 'Checked-out';
        await booking.save();
        
        assignedInstance.status = 'CLEANING';
        await assignedInstance.save();
        console.log("✅ Guest Checked-out, Room marked CLEANING");

        // 8. Housekeeping (Clean)
        console.log("🧹 Performing Housekeeping (Cleaning -> Clean)...");
        assignedInstance.status = 'CLEAN';
        await assignedInstance.save();
        console.log("✅ Room marked CLEAN");

        // 9. Housekeeping (Release)
        console.log("🔓 Performing Housekeeping (Clean -> Free)...");
        assignedInstance.status = 'FREE';
        await assignedInstance.save();
        console.log("✅ Room marked FREE");

        console.log("\n🎉 ALL SYSTEM CHECKS PASSED SUCCESSFULLY!");

        // Cleanup
        await RoomListing.deleteMany({ title: testTitle });
        await RoomInstance.deleteMany({ roomListing: roomListing._id });
        await Booking.deleteOne({ _id: booking._id });

    } catch (err) {
        console.error("\n❌ VERIFICATION FAILED:", err);
    } finally {
        await mongoose.connection.close();
    }
}

verifySystem();
