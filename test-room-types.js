const mongoose = require("mongoose");
require("dotenv").config({ path: __dirname + "/.env" });

const RoomListing = require("./models/RoomListing");

async function testRoomTypes() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log("✅ Connected to MongoDB\n");

        // Get all active rooms
        const allRooms = await RoomListing.find({ status: "active" }).lean();
        console.log("=== ALL ACTIVE ROOMS ===");
        console.log(`Total: ${allRooms.length} rooms\n`);

        allRooms.forEach((room, index) => {
            console.log(`${index + 1}. Title: "${room.title}"`);
            console.log(`   Room Type: "${room.roomType}"`);
            console.log(`   Total Rooms: ${room.totalRooms}`);
            console.log(`   Capacity: ${room.capacity}`);
            console.log("");
        });

        // Test Twin filter
        console.log("\n=== TESTING TWIN FILTER ===");
        const twinRooms = await RoomListing.find({
            status: "active",
            roomType: "Twin"
        }).lean();
        console.log(`Found ${twinRooms.length} Twin rooms:`);
        twinRooms.forEach(room => {
            console.log(`  - ${room.title} (${room.roomType})`);
        });

        // Test Standard filter
        console.log("\n=== TESTING STANDARD FILTER ===");
        const standardRooms = await RoomListing.find({
            status: "active",
            roomType: "Standard"
        }).lean();
        console.log(`Found ${standardRooms.length} Standard rooms:`);
        standardRooms.forEach(room => {
            console.log(`  - ${room.title} (${room.roomType})`);
        });

        await mongoose.connection.close();
        console.log("\n✅ Test complete");
    } catch (err) {
        console.error("❌ Error:", err);
        process.exit(1);
    }
}

testRoomTypes();
