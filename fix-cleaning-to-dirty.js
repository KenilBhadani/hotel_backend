// Quick script to change all CLEANING rooms to DIRTY
// Run this once to fix existing rooms stuck in CLEANING status

const mongoose = require('mongoose');
require('dotenv').config();

const RoomInstance = require('./models/RoomInstance');

async function fixCleaningRooms() {
    try {
        // Connect to MongoDB
        await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/hotelDB');
        console.log('✅ Connected to MongoDB');

        // Find all rooms in CLEANING status
        const cleaningRooms = await RoomInstance.find({ status: 'CLEANING' });
        console.log(`\n📋 Found ${cleaningRooms.length} rooms in CLEANING status:`);

        cleaningRooms.forEach(room => {
            console.log(`   - Room ${room.roomNumber} (ID: ${room._id})`);
        });

        if (cleaningRooms.length === 0) {
            console.log('\n✅ No rooms need fixing. All good!');
            process.exit(0);
        }

        // Update all CLEANING rooms to DIRTY
        const result = await RoomInstance.updateMany(
            { status: 'CLEANING' },
            {
                $set: {
                    status: 'DIRTY',
                    lastStatusUpdate: new Date()
                }
            }
        );

        console.log(`\n✅ Updated ${result.modifiedCount} rooms from CLEANING to DIRTY`);
        console.log('\n🎉 Done! All rooms that were in CLEANING are now DIRTY.');
        console.log('   Go to Admin Panel → Room Status → Click "Dirty" filter to see them.');

        process.exit(0);
    } catch (error) {
        console.error('❌ Error:', error);
        process.exit(1);
    }
}

fixCleaningRooms();
