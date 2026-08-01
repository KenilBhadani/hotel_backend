const mongoose = require("mongoose");

const reviewSchema = new mongoose.Schema({
  bookingId: { type: mongoose.Schema.Types.ObjectId, ref: "Booking", required: true },
  roomId: { type: mongoose.Schema.Types.ObjectId, ref: "Room", required: true },
  rating: { type: Number, min: 1, max: 5, required: true },
  comment: { type: String },
  userEmail: { type: String }, // for guests or logged-in user
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("Review", reviewSchema);
