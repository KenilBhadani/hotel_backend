const mongoose = require("mongoose");

const RoomInstanceSchema = new mongoose.Schema(
  {
    // Reference to the RoomListing
    roomListing: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "RoomListing",
      required: true,
    },

    // Physical room number or identifier
    roomNumber: {
      type: String,
      required: true,
    },

    // Current status of the room
    status: {
      type: String,
      // FREE=Available, STAY=Occupied, DIRTY=Needs Cleaning, CLEANING=In Progress, MAINTENANCE=Under Repair, READY=Inspected/Ready, REVIEW=Waiting Admin Approval
      enum: ["FREE", "STAY", "DIRTY", "CLEANING", "MAINTENANCE", "READY", "REVIEW"],
      default: "FREE",
    },

    // Staff assigned to clean or maintain this room
    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Staff",
      default: null
    },

    // Timestamp when status last changed
    lastStatusUpdate: {
      type: Date,
      default: Date.now
    }
  },
  { timestamps: true }
);

// ✅ Performance Indexes
RoomInstanceSchema.index({ roomListing: 1, status: 1 });
RoomInstanceSchema.index({ status: 1 });
RoomInstanceSchema.index({ assignedTo: 1 });

// Export model
module.exports =
  mongoose.models.RoomInstance || mongoose.model("RoomInstance", RoomInstanceSchema);
