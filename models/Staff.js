const mongoose = require("mongoose");

const staffSchema = new mongoose.Schema(
  {
    staffId: {
      type: String,
      unique: true
    }
    ,
    name: {
      type: String,
      required: true,
      trim: true
    },

    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true
    },

    phone: {
      type: String,
      required: true
    },

    role: {
      type: String,
      enum: [
        "Admin", // changed from AdminStaff for consistency with frontend/auth logic if needed, but keeping both or mapping is safer. 
        // Actually user input says "Admin", "Receptionist", "Housekeeping", "Maintenance".
        // Existing verifyStaff middleware checks ["Housekeeping", "Receptionist", "Manager", "Admin", "admin"].
        // Let's keep existing and add "Admin" just in case, or rely on "AdminStaff" if that's what's used.
        // The user explicitly listed: Admin, Receptionist, Housekeeping, Maintenance.
        "Admin",
        "AdminStaff",
        "Receptionist",
        "Housekeeping",
        "Maintenance",
        "Manager"
      ],
      required: true
    },

    shift: {
      type: String,
      enum: ["Morning", "Evening", "Night"],
      default: "Morning"
    },

    password: {
      type: String,
      required: true,
      select: false
    },

    hasDashboardAccess: {
      type: Boolean,
      default: true
    },

    isActive: {
      type: Boolean,
      default: true
    }
  },
  { timestamps: true }
);

// ✅ Performance Indexes
staffSchema.index({ email: 1 });
staffSchema.index({ isActive: 1, role: 1 });
staffSchema.index({ staffId: 1 });

module.exports = mongoose.model("Staff", staffSchema);
