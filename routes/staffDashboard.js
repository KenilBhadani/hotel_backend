const express = require("express");
const router = express.Router();
const Room = require("../models/RoomListing");
const RoomInstance = require("../models/RoomInstance");
const Task = require("../models/Task");
const Booking = require("../models/Booking"); // if exists
const verifyStaff = require("../middleware/verifyStaff");

router.get("/dashboard", verifyStaff, async (req, res) => {
  try {
    const availableRooms = await Room.countDocuments({
      status: "active"
    });

    const activeGuests = await Booking.countDocuments({
      bookingStatus: "Checked-in"
    });

    const checkInsToday = await Booking.countDocuments({
      actualCheckIn: {
        $gte: new Date(new Date().setHours(0, 0, 0))
      }
    });

    const pendingTasks = await Task.countDocuments({
      status: "Pending"
    });

    res.json({
      availableRooms,
      checkInsToday,
      activeGuests,
      pendingTasks,
      occupancy: 82 // can be calculated later
    });
  } catch (err) {
    res.status(500).json({ message: "Staff dashboard error" });
  }
});

// GET /panel - comprehensive panel data for staff dashboard
router.get("/panel", verifyStaff, async (req, res) => {
  try {
    // ✅ FIXED: Include all operational room statuses (active, available, STAY, CLEANING, CLEAN, FREE)
    const roomDocs = await Room.find({ status: { $in: ["active", "available", "STAY", "CLEANING", "CLEAN", "FREE"] } });
    let totalRooms = 0;
    let availableRooms = 0;
    let occupiedRooms = 0;
    let cleaningRooms = 0;
    let maintenanceRooms = 0;

    // ✅ Date boundaries for today
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);

    for (const room of roomDocs) {
      totalRooms += room.totalRooms;

      // ✅ Count CHECKED-IN guests (occupied rooms)
      const occupiedForRoom = await Booking.countDocuments({
        roomId: room._id,
        bookingStatus: "Checked-in"
      });

      // ✅ Count CONFIRMED bookings for TODAY (arriving today or staying through)
      const bookedForRoom = await Booking.countDocuments({
        roomId: room._id,
        bookingStatus: "Confirmed",
        checkIn: { $lte: endOfDay },
        checkOut: { $gte: startOfDay }
      });

      // ✅ Calculate available = Total - (Occupied + Booked)
      availableRooms += Math.max(0, room.totalRooms - occupiedForRoom - bookedForRoom);
      occupiedRooms += occupiedForRoom;
    }

    // ✅ Count rooms by status - use uppercase (CLEANING not cleaning)
    cleaningRooms = await Room.countDocuments({ status: "CLEANING" });
    maintenanceRooms = await Room.countDocuments({ status: "MAINTENANCE" });

    const stats = {
      totalRooms,
      availableRooms,
      occupiedRooms,
      cleaningRooms,
      maintenanceRooms,
      activeGuests: await Booking.countDocuments({ bookingStatus: "Checked-in" }),
      checkInsToday: await Booking.countDocuments({
        actualCheckIn: { $gte: new Date(new Date().setHours(0, 0, 0)) }
      }),
      checkOutsToday: await Booking.countDocuments({
        actualCheckOut: { $gte: new Date(new Date().setHours(0, 0, 0)) }
      }),
      pendingTasks: await Task.countDocuments({ status: "Pending" }),
      occupancy: 0 // will be calculated in frontend
    };

    // ✅ Rooms (include STAY, CLEANING, CLEAN, FREE for operational tracking)
    const rooms = await Room.find({ status: { $in: ["active", "STAY", "CLEANING", "CLEAN", "FREE"] } }).limit(100);

    // ✅ Recent bookings (limit to 50 for history)
    // But also include ALL bookings relevant for Today's Check-in/Check-out

    const todayBookings = await Booking.find({
      $or: [
        { checkIn: { $gte: startOfDay, $lte: endOfDay }, bookingStatus: 'Confirmed' }, // Check-ins
        { checkOut: { $gte: startOfDay, $lte: endOfDay }, bookingStatus: 'Checked-in' }, // Check-outs
        { bookingStatus: 'Checked-in' } // Currently staying guests
      ]
    }).populate('roomId');

    const recentBookings = await Booking.find({})
      .sort({ createdAt: -1 })
      .limit(20)
      .populate('roomId');

    // Merge and deduplicate
    const bookingMap = new Map();
    [...todayBookings, ...recentBookings].forEach(b => bookingMap.set(String(b._id), b));
    const bookings = Array.from(bookingMap.values());

    // Tasks
    const tasks = await Task.find({})
      .sort({ createdAt: -1 })
      .limit(50);

    // Guests (checked-in bookings)
    const guests = await Booking.find({ bookingStatus: "Checked-in" })
      .populate('roomId')
      .sort({ actualCheckIn: -1 })
      .limit(50);

    res.json({
      stats,
      rooms,
      bookings,
      tasks,
      guests
    });
  } catch (err) {
    console.error("Panel data error:", err);
    res.status(500).json({ message: "Failed to load panel data" });
  }
});

// GET bookings - staff can list bookings
router.get('/bookings', verifyStaff, async (req, res) => {
  try {
    const bookings = await Booking.find({}).sort({ createdAt: -1 }).populate('roomId');
    res.json(bookings);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to load bookings' });
  }
});

// GET /api/staff/bookings/:id - get single booking details
router.get('/bookings/:id', verifyStaff, async (req, res) => {
  try {
    const { id } = req.params;
    const booking = await Booking.findById(id).populate('roomId');
    if (!booking) {
      return res.status(404).json({ message: 'Booking not found' });
    }
    res.json(booking);
  } catch (err) {
    console.error('GET BOOKING ERROR:', err);
    res.status(500).json({ message: 'Failed to load booking' });
  }
});

// PUT /bookings/:id/status - update booking status (for frontend compatibility)
router.put('/bookings/:id/status', verifyStaff, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    console.log(`[STAFF ACTION] staffId=${req.user.id} role=${req.user.role} status=${status} bookingId=${id}`);
    const booking = await Booking.findById(id);
    if (!booking) return res.status(404).json({ message: 'Not found' });

    const actionMap = {
      'Checked-in': 'checkin',
      'Checked-out': 'checkout',
      'Cancelled': 'cancel'
    };

    const action = actionMap[status];
    if (!action) return res.status(400).json({ message: 'Unknown status' });

    // Authorization and per-action logic
    if (action === 'checkin') {
      // Only Receptionist may check in
      if (req.user.role !== 'Receptionist') return res.status(403).json({ message: 'Only Receptionist may perform check-in' });

      // Ensure not already checked-in
      if (booking.bookingStatus === 'Checked-in') return res.status(400).json({ message: 'Already checked-in' });

      // Check room availability before check-in
      const room = await Room.findById(booking.roomId);
      if (!room) return res.status(404).json({ message: 'Room not found' });

      // Find an available RoomInstance for this room type
      const availableInstance = await RoomInstance.findOne({
        roomListing: booking.roomId,
        status: 'FREE'
      });

      if (!availableInstance) {
        return res.status(400).json({ message: 'No rooms available for check-in' });
      }

      const now = new Date();

      // Assign the room instance and set status to STAY
      availableInstance.status = 'STAY';
      await availableInstance.save();

      // Update booking using partial update (avoid full validation failures)
      await Booking.updateOne({ _id: booking._id }, {
        $set: {
          bookingStatus: 'Checked-in',
          actualCheckIn: now,
          assignedRoomNumber: availableInstance.roomNumber,
          assignedRoomInstance: availableInstance._id
        },
        $push: { history: { action: 'checkin', by: req.user.id, note: `Checked in by ${req.user.role} - Room ${availableInstance.roomNumber}`, createdAt: now } }
      });

    } else if (action === 'checkout') {
      // Only Receptionist may check out
      if (req.user.role !== 'Receptionist') return res.status(403).json({ message: 'Only Receptionist may perform check-out' });

      if (booking.bookingStatus !== 'Checked-in') return res.status(400).json({ message: 'Booking is not checked-in' });

      const now = new Date();

      await Booking.updateOne({ _id: booking._id }, {
        $set: { bookingStatus: 'Checked-out', actualCheckOut: now },
        $push: { history: { action: 'checkout', by: req.user.id, note: `Checked out by ${req.user.role}`, createdAt: now } }
      });

      // 🔄 AUTOMATED WORKFLOW: Set assigned room instance to DIRTY status after check-out
      try {
        if (booking.assignedRoomInstance) {
          const roomInstance = await RoomInstance.findById(booking.assignedRoomInstance);
          if (roomInstance) {
            roomInstance.status = 'DIRTY'; // Changed from CLEANING to DIRTY - rooms need inspection first
            await roomInstance.save();
            console.log(`[AUTO WORKFLOW] Room ${roomInstance.roomNumber} set to DIRTY after check-out`);
          }
        }
      } catch (roomErr) {
        console.error('Failed to update room instance status after checkout:', roomErr);
      }

    } else if (action === 'cancel') {
      // Cancellation allowed for Receptionist or Manager
      if (!['Receptionist', 'Manager'].includes(req.user.role)) return res.status(403).json({ message: 'Forbidden' });
      await Booking.updateOne({ _id: booking._id }, {
        $set: { bookingStatus: 'Cancelled' },
        $push: { history: { action: 'cancel', by: req.user.id, note: `Cancelled by ${req.user.role}`, createdAt: new Date() } }
      });
    }

    // fetch updated booking to return
    const updatedBooking = await Booking.findById(booking._id).populate('roomId');

    console.log(`[STAFF ACTION] booking ${id} status -> ${updatedBooking.bookingStatus}`);

    // notify guest via email about status change
    try {
      const sendEmail = require('../utils/sendEmail');
      if (updatedBooking && updatedBooking.email) {
        await sendEmail({
          to: updatedBooking.email,
          subject: `Booking ${action} - ${updatedBooking._id}`,
          html: `<p>Your booking has been <strong>${updatedBooking.bookingStatus}</strong>. If you have questions please contact us.</p>`
        });
      }
    } catch (e) {
      console.error('Guest email failed', e.message);
    }

    res.json({ success: true, message: `Booking ${action} completed`, booking: updatedBooking });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Action failed' });
  }
});

// GET /panel - aggregated data for staff panel (dashboard + lists) [DUPLICATE - REMOVED IN FAVOR OF FIRST /panel]
// This endpoint is superseded by the first GET /panel above
// Keeping stub for backward compatibility if needed
router.get('/panel-alt', verifyStaff, async (req, res) => {
  try {
    // ✅ Dashboard stats - count available as Total - (Occupied + Booked)
    const roomDocs = await Room.find({ status: { $in: ["active", "available", "STAY", "CLEANING", "CLEAN", "FREE"] } });
    let totalRooms = 0;
    let availableRooms = 0;
    let occupiedRooms = 0;

    for (const room of roomDocs) {
      totalRooms += room.totalRooms;
      const occupiedForRoom = await Booking.countDocuments({
        roomId: room._id,
        bookingStatus: "Checked-in"
      });
      const bookedForRoom = await Booking.countDocuments({
        roomId: room._id,
        bookingStatus: "Confirmed"
      });
      availableRooms += Math.max(0, room.totalRooms - occupiedForRoom - bookedForRoom);
      occupiedRooms += occupiedForRoom;
    }

    const activeGuests = await Booking.countDocuments({
      bookingStatus: 'Checked-in'
    });

    const checkInsToday = await Booking.countDocuments({
      checkIn: {
        $gte: new Date(new Date().setHours(0, 0, 0))
      }
    });

    const pendingTasks = await Task.countDocuments({
      status: 'Pending'
    });

    // ✅ Lists - include all operational room statuses
    const rooms = await Room.find({ status: { $in: ["active", "STAY", "CLEANING", "CLEAN", "FREE"] } }).limit(200);
    const bookings = await Booking.find({}).sort({ checkIn: 1 }).limit(200).populate('roomId');
    const tasks = await Task.find({}).sort({ createdAt: -1 }).limit(200);



    // derive guest list from checked-in bookings
    const guestDocs = await Booking.find({ bookingStatus: 'Checked-in' }).select('firstName lastName phone email checkIn checkOut bookingStatus roomId').limit(200).populate('roomId');
    const guests = guestDocs.map(b => ({
      _id: b._id,
      name: `${b.firstName || ''} ${b.lastName || ''}`.trim(),
      phone: b.phone || b.mobileNo || '',
      email: b.email || '',
      checkIn: b.checkIn,
      checkOut: b.checkOut,
      bookingStatus: b.bookingStatus || b.status || '',
      roomId: b.roomId
    }));

    res.json({
      stats: { availableRooms, checkInsToday, activeGuests, pendingTasks, occupancy: Math.round((activeGuests / Math.max(1, availableRooms)) * 100) },
      rooms,
      bookings,
      tasks,
      guests
    });
  } catch (err) {
    console.error('STAFF PANEL ERROR', err);
    res.status(500).json({ message: 'Failed to load panel data' });
  }
});

// Provide a lightweight rooms endpoint as well
router.get('/rooms', verifyStaff, async (req, res) => {
  try {
    const r = await Room.find({ status: { $in: ['active', 'available', 'occupied', 'cleaning', 'maintenance'] } }).limit(500);
    res.json(r.map(rr => ({ ...rr.toObject(), roomStatus: rr.status })));
  } catch (err) {
    console.error('GET ROOMS ERROR', err);
    res.status(500).json({ message: 'Failed to load rooms' });
  }
});

// PATCH room status (Housekeeping / Manager)
router.patch('/rooms/:id', verifyStaff, async (req, res) => {
  try {
    if (!['Housekeeping', 'Manager'].includes(req.user.role)) return res.status(403).json({ message: 'Forbidden' });
    const { id } = req.params;
    const { status } = req.body;
    if (!status) return res.status(400).json({ message: 'Status required' });
    const room = await Room.findById(id);
    if (!room) return res.status(404).json({ message: 'Room not found' });
    room.status = status;
    await room.save();
    res.json({ success: true, room });
  } catch (err) {
    console.error('PATCH ROOM ERROR', err);
    res.status(500).json({ message: 'Failed to update room' });
  }
});

// =========================
// STAFF CREATE BOOKING (Receptionist)
// =========================
router.post('/bookings', verifyStaff, async (req, res) => {
  try {
    // Only Receptionist can create bookings
    if (req.user.role !== 'Receptionist') {
      return res.status(403).json({ message: 'Only Receptionist can create bookings' });
    }

    const {
      firstName,
      lastName,
      email,
      phone,
      checkIn,
      checkOut,
      roomId,
      specialRequests,
      totalAmount
    } = req.body;

    // Validate required fields
    if (!firstName || !lastName || !email || !phone || !checkIn || !checkOut || !roomId) {
      return res.status(400).json({ message: 'All fields are required' });
    }

    const checkInDate = new Date(checkIn);
    const checkOutDate = new Date(checkOut);

    if (isNaN(checkInDate.getTime()) || isNaN(checkOutDate.getTime()) || checkInDate >= checkOutDate) {
      return res.status(400).json({ message: 'Invalid check-in/check-out dates' });
    }

    // Check room availability
    const room = await Room.findById(roomId);
    if (!room) {
      return res.status(404).json({ message: 'Room not found' });
    }

    // Count overlapping bookings
    const overlappingBookings = await Booking.countDocuments({
      roomId,
      bookingStatus: { $nin: ['Cancelled', 'Checked-out'] },
      checkIn: { $lt: checkOutDate },
      checkOut: { $gt: checkInDate },
    });

    if (overlappingBookings >= room.totalRooms) {
      return res.status(400).json({ message: 'No rooms available for the selected dates' });
    }

    // Create booking
    const booking = new Booking({
      roomId,
      firstName,
      lastName,
      email,
      phone,
      checkIn: checkInDate,
      checkOut: checkOutDate,
      specialRequests,
      totalAmount,
      bookingStatus: 'Confirmed',
      createdBy: req.user.userId
    });

    await booking.save();

    // Populate room data for response
    await booking.populate('roomId');

    console.log(`[STAFF BOOKING] Receptionist ${req.user.userId} created booking ${booking._id}`);

    res.json({ success: true, booking });

  } catch (err) {
    console.error('STAFF CREATE BOOKING ERROR:', err);
    res.status(500).json({ message: 'Failed to create booking' });
  }
});

// =========================
// GET GUESTS DIRECTORY
// =========================
router.get('/guests', verifyStaff, async (req, res) => {
  try {
    // Fetch Confirmed (Expected), Checked-in (In-House), and Checked-out (History)
    // Removed strict status filter temporarily to DEBUG
    const query = {};

    console.log('[GET GUESTS] Querying ALL bookings');

    const guests = await Booking.find(query)
      .select('firstName lastName email phone bookingStatus roomId assignedRoomNumber checkIn checkOut actualCheckIn')
      .sort({ checkIn: -1 })
      .limit(300)
      .populate('roomId', 'title roomType');

    console.log(`[GET GUESTS] Found ${guests.length} records`);

    res.json(guests);
  } catch (err) {
    console.error('GET GUESTS ERROR:', err);
    res.status(500).json({ message: 'Failed to load guest directory' });
  }
});

module.exports = router;
