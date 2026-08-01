// =======================================
// server.js – Hotel Management Backend
// =======================================

// 1️⃣ Load environment variables
require("dotenv").config();

const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const path = require("path");
const passport = require("passport");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const session = require("express-session");
const { MongoStore } = require("connect-mongo");

// 2️⃣ Initialize Express app
const app = express();

// 3️⃣ CORS – allow frontend to send requests with credentials
app.use(cors({
  origin: process.env.FRONTEND_URL || "http://localhost:3000",
  credentials: true
}));

// 4️⃣ Body parser
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 5️⃣ Session & Passport setup
app.use(session({
  secret: process.env.SESSION_SECRET || "change_this_secret",
  resave: false,
  saveUninitialized: false,
  store: new MongoStore({ mongoUrl: process.env.MONGO_URI }),
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    maxAge: 24 * 60 * 60 * 1000, // 1 day
    sameSite: process.env.NODE_ENV === "production" ? "none" : "lax"
  }
}));

app.use(passport.initialize());
app.use(passport.session());

// 6️⃣ Debug Google OAuth (optional) - Only in development
if (process.env.NODE_ENV === 'development') {
  console.log("GOOGLE_CLIENT_ID:", process.env.GOOGLE_CLIENT_ID ? '✓ Set' : '✗ Missing');
  console.log("GOOGLE_CLIENT_SECRET:", process.env.GOOGLE_CLIENT_SECRET ? '✓ Set' : '✗ Missing');
  console.log("GOOGLE_CALLBACK_URL:", process.env.GOOGLE_CALLBACK_URL);
}

// 7️⃣ Passport strategies
require("./config/passport");

// 8️⃣ Static uploads folder
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// 9️⃣ Connect to MongoDB
mongoose.connect(process.env.MONGO_URI)
  .then(async () => {
    console.log("✅ MongoDB connected");
  })
  .catch(err => console.error("❌ MongoDB connection error:", err));

// 10️⃣ Routes
app.use("/api/auth", require("./routes/auth")); // Local + Google
app.use("/api/rooms", require("./routes/room"));
app.use("/api/admin/rooms", require("./routes/adminRooms"));
app.use("/api/staff", require("./routes/staffDashboard"));
app.use("/api/staff/guests", require("./routes/staffGuests"));
app.use("/api/staff/auth", require("./routes/staffAuth"));
app.use("/api/staff/tasks", require("./routes/staffTasks"));
app.use("/api/staff/rooms", require("./routes/staffRooms"));
app.use("/api/admin/staff", require("./routes/adminStaff"));
app.use("/api/admin/users", require("./routes/adminUsers"));
app.use("/api/admin/bookings", require("./routes/adminBookings"));
app.use("/api/bookings", require("./routes/booking"));
app.use("/api/admin/payments", require("./routes/adminPayments"));
app.use("/api/reviews", require("./routes/review"));
app.use("/api/subscribe", require("./routes/subscribe"));
app.use("/api/contact", require("./routes/contact"));
app.use("/api/admin", require("./routes/adminDashboard"));

// 11️⃣ Stripe payment intent
app.post("/api/bookings/create-payment-intent", async (req, res) => {
  try {
    const { amount, bookingData } = req.body;

    if (!amount || typeof amount !== "number" || amount <= 0) {
      return res.status(400).json({ error: "Invalid amount" });
    }

    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100),
      currency: "inr",
      payment_method_types: ["card"],
      metadata: {
        email: bookingData?.email || "guest@example.com",
        roomId: bookingData?.roomId || "",
        name: `${bookingData?.firstName || ""} ${bookingData?.lastName || ""}`
      }
    });

    res.json({ clientSecret: paymentIntent.client_secret });
  } catch (error) {
    console.error("Stripe Error:", error.message);
    res.status(500).json({ error: "Stripe payment failed" });
  }
});

// 12️⃣ Health check
app.get("/", (_req, res) => res.send("✅ Hotel API running"));

// 13️⃣ 404 handler for API
app.use("/api/*", (_req, res) => res.status(404).json({ error: "API route not found" }));

// 14️⃣ Global error handler
app.use((err, _req, res, _next) => {
  console.error("❌ Server Error:", err);
  res.status(500).json({ error: "Internal Server Error" });
});

// 15️⃣ Start server
const PORT = process.env.PORT || 5000;
const HOST = process.env.HOST || "0.0.0.0";
app.listen(PORT, HOST, () => console.log(`🚀 Server running on http://${HOST}:${PORT}`));


