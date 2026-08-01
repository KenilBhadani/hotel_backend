const mongoose = require("mongoose");

const bookingSchema = new mongoose.Schema(
  {
    roomId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "RoomListing",
      required: true,
    },

    // snapshot
    roomTitle: String,
    ratePerNight: Number,

    firstName: String,
    lastName: String,
    email: String,
    phone: String,
    gst: String,
    requests: String,

    nights: Number,
    subtotal: Number,
    discountPercent: {
      type: Number,
      default: 0,
    },
    discountAmount: {
      type: Number,
      default: 0,
    },
    gstAmount: Number,

    totalAmount: {
      type: Number,
      required: true,
    },

    checkIn: {
      type: Date,
      required: true,
    },
    checkOut: {
      type: Date,
      required: true,
    },

    paymentIntentId: String,

    paymentStatus: {
      type: String,
      enum: ["Paid", "Pending", "Cash"],
      default: "Pending",
    },

    bookingStatus: {
      type: String,
      enum: ["Pending", "Confirmed", "Checked-in", "Checked-out", "Cancelled"],
      default: "Pending",
    },

    // Check-in/Check-out tracking
    actualCheckIn: Date,
    actualCheckOut: Date,

    // Assigned room number during check-in
    assignedRoomNumber: String,

    // Assigned room instance during check-in
    assignedRoomInstance: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "RoomInstance",
    },

    // History of status changes
    history: [{
      action: String, // 'checkin', 'checkout', 'cancel', etc.
      by: { type: mongoose.Schema.Types.ObjectId, ref: "Staff" },
      note: String,
      createdAt: { type: Date, default: Date.now }
    }],

    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  { timestamps: true }
);

// ✅ Performance Indexes - Critical for query speed
bookingSchema.index({ email: 1 });
bookingSchema.index({ bookingStatus: 1, checkIn: 1, checkOut: 1 });
bookingSchema.index({ roomId: 1, checkIn: 1, checkOut: 1 });
bookingSchema.index({ userId: 1 });
bookingSchema.index({ createdAt: -1 });

module.exports = mongoose.model("Booking", bookingSchema);
