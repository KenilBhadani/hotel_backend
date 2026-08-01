const express = require("express");
const router = express.Router();
const Booking = require("../models/Booking");
const Review = require("../models/Review");

/* =========================
   SUBMIT REVIEW
========================= */
router.post("/review", async (req, res) => {
  try {
    const { bookingId, rating, comment } = req.body;
    const normalizedRating = Number(rating);

    if (!bookingId) {
      return res.status(400).json({ error: "Booking ID is required" });
    }

    if (!Number.isFinite(normalizedRating) || normalizedRating < 1 || normalizedRating > 5) {
      return res.status(400).json({ error: "Rating must be between 1 and 5" });
    }

    // Find the booking to get roomId
    const booking = await Booking.findById(bookingId);
    if (!booking) return res.status(404).json({ error: "Booking not found" });

    const existingReview = await Review.findOne({
      bookingId,
      userEmail: booking.email,
    });
    if (existingReview) {
      return res.status(409).json({ error: "Review already submitted for this booking" });
    }

    const review = new Review({
      bookingId,
      roomId: booking.roomId,
      rating: normalizedRating,
      comment,
      userEmail: booking.email,
    });

    await review.save();

    res.json({ success: true, review });
  } catch (err) {
    console.error("Review submission error:", err);
    res.status(500).json({ error: "Failed to submit review" });
  }
});

module.exports = router;
