const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken");
const Stripe = require("stripe");
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const Booking = require("../models/Booking");

/* =====================
   ADMIN VERIFICATION
===================== */
function verifyAdmin(req, res, next) {
  try {
    const auth = req.headers.authorization;
    if (!auth) return res.status(401).json({ message: "Unauthorized" });

    const token = auth.replace("Bearer ", "");
    const data = jwt.verify(token, process.env.JWT_SECRET);

    if (!data || data.role !== "admin") {
      return res.status(403).json({ message: "Forbidden" });
    }

    req.user = { id: data.userId, role: data.role };
    next();
  } catch (err) {
    console.error("verifyAdmin error:", err.message);
    return res.status(401).json({ message: "Invalid token" });
  }
}

/* =====================
   PAYMENT SUMMARY
   GET /api/admin/payments/summary?month=YYYY-MM
===================== */
router.get("/summary", verifyAdmin, async (req, res) => {
  try {
    const { month } = req.query;
    if (!month) return res.status(400).json({ message: "Month required" });

    const [year, mon] = month.split("-").map(Number);
    const start = new Date(year, mon - 1, 1, 0, 0, 0, 0);
    const end = new Date(year, mon, 0, 23, 59, 59, 999);

    const agg = await Booking.aggregate([
      {
        $match: {
          createdAt: { $gte: start, $lte: end }
        }
      },
      {
        $group: {
          _id: null,
          paid: {
            $sum: {
              $cond: [
                { $in: ["$paymentStatus", ["Paid", "Cash"]] },
                {
                  $ifNull: [
                    "$amount",
                    { $ifNull: ["$totalAmount", 0] }
                  ]
                },
                0
              ]
            }
          },
          pending: {
            $sum: {
              $cond: [
                { $eq: ["$paymentStatus", "Pending"] },
                {
                  $ifNull: [
                    "$amount",
                    { $ifNull: ["$totalAmount", 0] }
                  ]
                },
                0
              ]
            }
          },
          bookings: { $sum: 1 }
        }
      }
    ]);

    const result = agg[0] || { paid: 0, pending: 0, bookings: 0 };

    res.json({
      paid: result.paid,
      pending: result.pending,
      totalRevenue: result.paid + result.pending,
      bookings: result.bookings
    });
  } catch (err) {
    console.error("summary error:", err);
    res.status(500).json({ message: "Payment summary error" });
  }
});

/* =====================
   PAYMENT TRANSACTIONS
   GET /api/admin/payments/transactions?month=YYYY-MM
===================== */
router.get("/transactions", verifyAdmin, async (req, res) => {
  try {
    const { month } = req.query;
    const query = {};

    if (month) {
      const [year, mon] = month.split("-").map(Number);
      const start = new Date(year, mon - 1, 1, 0, 0, 0, 0);
      const end = new Date(year, mon, 0, 23, 59, 59, 999);
      query.createdAt = { $gte: start, $lte: end };
    }

    const docs = await Booking.find(query)
      .sort({ createdAt: -1 })
      .limit(50)
      .select("firstName lastName amount totalAmount paymentStatus bookingStatus createdAt");

    const transactions = docs.map(d => ({
      _id: d._id,
      firstName: d.firstName,
      lastName: d.lastName,
      totalAmount: d.amount ?? d.totalAmount ?? 0,
      paymentStatus: d.paymentStatus,
      bookingStatus: d.bookingStatus,
      createdAt: d.createdAt
    }));

    res.json(transactions);
  } catch (err) {
    console.error("transactions error:", err);
    res.status(500).json({ message: "Failed to load transactions" });
  }
});

/* =====================
   PAYMENT STATUS DISTRIBUTION
   GET /api/admin/payments/status-distribution?month=YYYY-MM&by=amount|count
===================== */
router.get("/status-distribution", verifyAdmin, async (req, res) => {
  try {
    const { month, by = "amount" } = req.query;
    const match = {};

    if (month) {
      const [year, mon] = month.split("-").map(Number);
      const start = new Date(year, mon - 1, 1, 0, 0, 0, 0);
      const end = new Date(year, mon, 0, 23, 59, 59, 999);
      match.createdAt = { $gte: start, $lte: end };
    }

    const agg = await Booking.aggregate([
      { $match: match },
      {
        $group: {
          _id: "$paymentStatus",
          total: by === "amount"
            ? {
                $sum: {
                  $ifNull: [
                    "$amount",
                    { $ifNull: ["$totalAmount", 0] }
                  ]
                }
              }
            : { $sum: 1 }
        }
      }
    ]);

    const result = {};
    agg.forEach(i => {
      result[i._id || "Unknown"] = i.total;
    });

    res.json(result);
  } catch (err) {
    console.error("status-distribution error:", err);
    res.status(500).json({ message: "Failed to compute distribution" });
  }
});

/* =====================
   PAYMENT TRENDS
   GET /api/admin/payments/trends?days=30
===================== */
router.get("/trends", verifyAdmin, async (req, res) => {
  try {
    const days = Math.min(180, Number(req.query.days) || 30);

    const end = new Date();
    end.setHours(23, 59, 59, 999);

    const start = new Date();
    start.setDate(start.getDate() - (days - 1));
    start.setHours(0, 0, 0, 0);

    const agg = await Booking.aggregate([
      {
        $match: {
          createdAt: { $gte: start, $lte: end },
          paymentStatus: { $in: ["Paid", "Cash"] }
        }
      },
      {
        $group: {
          _id: {
            $dateToString: {
              format: "%Y-%m-%d",
              date: "$createdAt"
            }
          },
          total: {
            $sum: {
              $ifNull: [
                "$amount",
                { $ifNull: ["$totalAmount", 0] }
              ]
            }
          }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    res.json({ days, series: agg });
  } catch (err) {
    console.error("trends error:", err);
    res.status(500).json({ message: "Failed to load trends" });
  }
});

/* =====================
   VERIFY & SYNC BOOKING
   PUT /api/admin/payments/verify/:id
===================== */
router.put("/verify/:id", verifyAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const booking = await Booking.findById(id);
    if (!booking) return res.status(404).json({ message: "Booking not found" });
    if (!booking.paymentIntentId) {
      return res.status(400).json({ message: "No paymentIntentId found" });
    }

    const pi = await stripe.paymentIntents.retrieve(booking.paymentIntentId);
    const stripeAmount = pi.amount ? pi.amount / 100 : 0;

    if (pi.status === "succeeded") {
      booking.paymentStatus = "Paid";
      booking.totalAmount = booking.amount ?? stripeAmount;
      await booking.save();

      return res.json({ success: true, booking });
    }

    booking.paymentStatus = "Pending";
    if (!booking.totalAmount && stripeAmount) {
      booking.totalAmount = stripeAmount;
    }
    await booking.save();

    res.json({ success: true, booking, stripeStatus: pi.status });
  } catch (err) {
    console.error("verify error:", err);
    res.status(500).json({ message: "Verification failed" });
  }
});

module.exports = router;
