const express = require("express");
const router = express.Router();
const Booking = require("../models/Booking");
const verifyStaff = require("../middleware/verifyStaff");

// =========================
// GET GUESTS DIRECTORY
// =========================
router.get("/", verifyStaff, async (req, res) => {
  try {
    console.log('[GET GUESTS] Querying active guests');

    // Fetch Confirmed (Expected), Checked-in (In-House), and Checked-out (History)
    const guests = await Booking.find({
      bookingStatus: { $in: ['Confirmed', 'Checked-in', 'Checked-out'] }
    })
    .select('firstName lastName email phone bookingStatus roomId assignedRoomNumber checkIn checkOut actualCheckIn')
    .sort({ checkIn: -1 }) // Newest first
    .limit(300) // Performance limit
    .populate('roomId', 'title roomType');

    console.log(`[GET GUESTS] Found ${guests.length} records`);

    res.json(guests);
  } catch (err) {
    console.error('GET GUESTS ERROR:', err);
    res.status(500).json({ message: 'Failed to load guest directory' });
  }
});

module.exports = router;