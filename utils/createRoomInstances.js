// utils/createRoomInstances.js
const RoomInstance = require("../models/RoomInstance");
const RoomListing = require("../models/RoomListing");

/**
 * Generate room number prefix based on room type
 * Single -> S, Double -> D, Twin -> T, Deluxe -> DX, Suite -> SU, etc.
 */
function getRoomPrefix(roomType) {
  const prefixMap = {
    'Single': 'S',
    'Double': 'D',
    'Twin': 'T',
    'Deluxe': 'DX',
    'Suite': 'SU',
    'Family': 'F',
    'Standard': 'ST',
    'Executive': 'E',
    'Presidential': 'P'
  };

  return prefixMap[roomType] || roomType.charAt(0).toUpperCase();
}

async function createRoomInstancesForListing(roomListingId, totalRooms) {
  try {
    const roomListing = await RoomListing.findById(roomListingId);
    if (!roomListing) {
      console.error("RoomListing not found for instance creation");
      return;
    }

    const prefix = getRoomPrefix(roomListing.roomType);
    const roomInstances = [];

    // Generate room numbers like D-101, D-102, D-103, etc.
    for (let i = 1; i <= totalRooms; i++) {
      const roomNumber = `${prefix}-${String(100 + i)}`; // D-101, D-102, etc.
      roomInstances.push({
        roomListing: roomListingId,
        roomNumber: roomNumber,
        status: "FREE",
      });
    }

    await RoomInstance.insertMany(roomInstances);
    console.log(`✅ Created ${totalRooms} room instances for ${roomListing.roomType} (${prefix}-101 to ${prefix}-${100 + totalRooms})`);
  } catch (err) {
    console.error("Error creating RoomInstances:", err);
  }
}

module.exports = createRoomInstancesForListing;
