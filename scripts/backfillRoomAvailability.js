const mongoose = require('mongoose');
require('dotenv').config();

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  const Room = require('../models/RoomListing');

  const rooms = await Room.find({});
  for (const r of rooms) {
    try {
      if (typeof r.totalRooms !== 'number') {
        console.warn(`Room ${r._id} missing totalRooms — skipping`);
        continue;
      }
      let av = (typeof r.availableRooms === 'number') ? r.availableRooms : 0;
      av = Math.max(0, Math.min(av, r.totalRooms));
      if (av !== r.availableRooms) {
        await Room.updateOne({ _id: r._id }, { $set: { availableRooms: av } });
        console.log(`Backfilled room ${r._id} availableRooms -> ${av}`);
      }
    } catch (err) {
      console.error(`Failed to update room ${r._id}:`, err.message);
    }
  }

  console.log('Backfill complete');
  process.exit(0);
}

run().catch(err => { console.error(err); process.exit(1); });