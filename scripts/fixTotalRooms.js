const mongoose = require('mongoose');
require('dotenv').config();

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  const Room = require('../models/RoomListing');

  const rooms = await Room.find({ $or: [ { totalRooms: { $exists: false } }, { totalRooms: null } ] });
  for (const r of rooms) {
    try {
      const defaultTotal = 1;
      const newTotal = defaultTotal;
      const desiredAvailable = (typeof r.availableRooms === 'number') ? Math.max(0, Math.min(r.availableRooms, newTotal)) : newTotal;
      await Room.updateOne({ _id: r._id }, { $set: { totalRooms: newTotal, availableRooms: desiredAvailable } });
      console.log(`Patched room ${r._id}: totalRooms -> ${newTotal}, availableRooms -> ${desiredAvailable}`);
    } catch (err) {
      console.error(`Failed to update room ${r._id}:`, err.message);
    }
  }

  console.log('fixTotalRooms: completed');
  process.exit(0);
}

run().catch(err => { console.error(err); process.exit(1); });