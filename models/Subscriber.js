const mongoose = require("mongoose");

const subscriberSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    paymentMethod: {
      type: String,
      enum: ["CARD"],
      default: "CARD",
    },
    membershipFee: {
      type: Number,
      default: 0,
    },
    paymentStatus: {
      type: String,
      enum: ["PENDING", "PAID", "FAILED"],
      default: "PENDING",
    },
    paymentIntentId: {
      type: String,
      default: "",
    },
    membershipActive: {
      type: Boolean,
      default: false,
    },
    expiresAt: {
      type: Date,
      default: null
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model("Subscriber", subscriberSchema);
