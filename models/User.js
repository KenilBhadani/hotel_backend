const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const userSchema = new mongoose.Schema(
  {
    /* ================= BASIC INFO ================= */
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
    },

    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, "Invalid email address"],
    },

    phone: {
      type: String,
      required: function () {
        return this.provider === "local";
      },
      unique: true,
      sparse: true, // Allows null values for Google users
    },

    password: {
      type: String,
      required: function () {
        return this.provider === "local";
      },
      select: false, // 🔒 never return password by default
      minlength: 6,
    },

    /* ================= AUTH PROVIDER ================= */
    provider: {
      type: String,
      enum: ["local", "google"],
      default: "local",
    },

    googleId: {
      type: String,
      default: null,
    },

    /* ================= ROLE ================= */
    role: {
      type: String,
      enum: ["admin", "user"],
      default: "user",
    },

    isActive: {
      type: Boolean,
      default: true,
    },

    /* ================= PASSWORD RESET ================= */
    resetToken: {
      type: String,
      default: null,
      index: true,
    },

    resetTokenExpiry: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

/* ================= PASSWORD HASHING ================= */
userSchema.pre("save", async function () {
  // Skip hashing for Google users
  if (!this.password) return;

  // Hash only if password changed
  if (!this.isModified("password")) return;

  this.password = await bcrypt.hash(this.password, 10);
});

/* ================= PASSWORD COMPARE ================= */
userSchema.methods.comparePassword = async function (enteredPassword) {
  // password must be selected explicitly in query
  return bcrypt.compare(enteredPassword, this.password);
};

/* ================= AUTO CLEAR EXPIRED RESET TOKEN ================= */
userSchema.methods.clearResetTokenIfExpired = function () {
  if (this.resetTokenExpiry && this.resetTokenExpiry < Date.now()) {
    this.resetToken = null;
    this.resetTokenExpiry = null;
  }
};

module.exports = mongoose.model("User", userSchema);
