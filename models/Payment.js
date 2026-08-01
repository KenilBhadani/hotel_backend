const mongoose = require("mongoose");

/* =========================
   PAYMENT MODEL
========================= */
const PaymentSchema = new mongoose.Schema(
  {
    booking: { type: mongoose.Schema.Types.ObjectId, ref: "Booking" },
    amount: { type: Number },
    currency: { type: String, default: "INR" },
    provider: { type: String },
    providerPaymentId: { type: String },
    status: { type: String }
  },
  { timestamps: true }
);

module.exports =
  mongoose.models.Payment || mongoose.model("Payment", PaymentSchema, "payments");
