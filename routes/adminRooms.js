const express = require("express");
const router = express.Router();
const Room = require("../models/RoomListing");
const upload = require("../middleware/uploadCloudinary");
const { deleteFromCloudinary } = require("../config/cloudinary");
const createRoomInstancesForListing = require("../utils/createRoomInstances");

const getCloudinaryPublicId = (imageUrl) => {
  if (!imageUrl || typeof imageUrl !== "string") return "";
  const parts = imageUrl.split("/");
  const lastPart = parts[parts.length - 1];
  const withoutExt = lastPart.split(".")[0];
  return withoutExt;
};

/* ======================================================
   GET ALL ROOMS (ADMIN)
====================================================== */
router.get("/", async (req, res) => {
  try {
    const rooms = await Room.find().sort({ createdAt: -1 }).lean();
    // Map totalRooms to availableRooms for frontend compatibility
    const roomsWithAvailable = rooms.map(room => ({
      ...room,
      availableRooms: room.totalRooms
    }));
    res.json(roomsWithAvailable);
  } catch (err) {
    console.error("ADMIN GET ROOMS ERROR:", err);
    res.status(500).json({ message: "Failed to load rooms" });
  }
});

/* ======================================================
   CREATE ROOM (ADMIN)
====================================================== */
router.post("/", upload.array("images", 5), async (req, res) => {
  try {
    const {
      title,
      description,
      roomType,
      size,
      capacity,
      bedType,
      totalRooms,
      availableRooms,
      amenities,
      planName,
      inclusions,
      depositPolicy,
      standardRate,
      currency,
    } = req.body;

    // ✅ Validation
    if (
      !title ||
      !roomType ||
      !capacity ||
      !bedType ||
      !(totalRooms || availableRooms) ||
      !standardRate
    ) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    // ✅ Check for duplicate title (case-insensitive)
    const normalizedTitle = title.trim().toLowerCase();
    const existingRoom = await Room.findOne({
      title: { $regex: new RegExp(`^${normalizedTitle}$`, 'i') }
    });

    if (existingRoom) {
      return res.status(400).json({
        message: `A room with the title "${title}" already exists. Please use a different title.`
      });
    }

    const imageFiles = req.files || [];
    const uploadedImages = imageFiles.map((file) => file.path);
    const uploadedPublicIds = imageFiles.map((file) => file.filename);

    const room = await Room.create({
      title,
      description,
      roomType,
      size: size ? Number(size) : undefined,
      capacity: Number(capacity),
      bedType,
      totalRooms: Number(totalRooms || availableRooms),

      images: uploadedImages,
      image: uploadedImages[0] || "",
      public_id: uploadedPublicIds[0] || "",

      amenities: amenities
        ? amenities.split(",").map((a) => a.trim())
        : [],

      rates: {
        planName: planName || "Standard Plan",
        inclusions: inclusions
          ? inclusions.split(",").map((i) => i.trim())
          : [],
        depositPolicy,
      },

      pricing: {
        standardRate: Number(standardRate),
        currency: currency || "INR",
      },

      status: "active",
    });

    // Create room instances based on totalRooms
    await createRoomInstancesForListing(room._id, room.totalRooms);

    res.status(201).json(room);
  } catch (err) {
    console.error("ADMIN CREATE ROOM ERROR:", err);
    res.status(500).json({ message: err.message });
  }
});

/* ======================================================
   UPDATE ROOM (ADMIN)
====================================================== */
router.put("/:id", upload.array("images", 5), async (req, res) => {
  try {
    const room = await Room.findById(req.params.id);
    if (!room) {
      return res.status(404).json({ message: "Room not found" });
    }

    // ✅ Check for duplicate title when updating (case-insensitive)
    if (req.body.title) {
      const normalizedTitle = req.body.title.trim().toLowerCase();
      const existingRoom = await Room.findOne({
        title: { $regex: new RegExp(`^${normalizedTitle}$`, 'i') },
        _id: { $ne: req.params.id } // Exclude current room
      });

      if (existingRoom) {
        return res.status(400).json({
          message: `A room with the title "${req.body.title}" already exists. Please use a different title.`
        });
      }
    }

    const existingImages = room.images?.length || 0;
    const newImages = req.files?.length || 0;

    if (existingImages + newImages > 5) {
      return res.status(400).json({ message: "Max 5 images allowed" });
    }

    if (req.files?.length) {
      for (const imageUrl of room.images || []) {
        if (typeof imageUrl === "string" && imageUrl.includes("res.cloudinary.com")) {
          const publicId = getCloudinaryPublicId(imageUrl);
          if (publicId) {
            await deleteFromCloudinary(publicId);
          }
        }
      }

      const uploadedImages = req.files.map((file) => file.path);
      const uploadedPublicIds = req.files.map((file) => file.filename);
      room.images = uploadedImages;
      room.image = uploadedImages[0] || "";
      room.public_id = uploadedPublicIds[0] || "";
    }

    if (req.body.removeImages) {
      const removeList = JSON.parse(req.body.removeImages);
      const removePublicIds = room.public_id ? [room.public_id] : [];

      room.images = room.images.filter((img) => !removeList.includes(img));

      if (room.images.length === 0) {
        room.image = "";
        room.public_id = "";
      } else if (removeList.includes(room.image)) {
        room.image = room.images[0] || "";
        room.public_id = room.public_id ? room.public_id : "";
      }

      for (const imageUrl of removeList) {
        const matchingPublicId = room.public_id && imageUrl === room.image ? room.public_id : "";
        if (matchingPublicId) {
          await deleteFromCloudinary(matchingPublicId);
        }
      }
    }

    // ✅ Update fields
    room.title = req.body.title ?? room.title;
    room.description = req.body.description ?? room.description;
    room.roomType = req.body.roomType ?? room.roomType;
    room.size = req.body.size ? Number(req.body.size) : room.size;
    room.capacity = req.body.capacity
      ? Number(req.body.capacity)
      : room.capacity;
    room.bedType = req.body.bedType ?? room.bedType;
    room.totalRooms = req.body.totalRooms || req.body.availableRooms
      ? Number(req.body.totalRooms || req.body.availableRooms)
      : room.totalRooms;

    if (req.body.amenities) {
      room.amenities = req.body.amenities
        .split(",")
        .map((a) => a.trim());
    }

    // ✅ Update Status
    if (req.body.status) {
      console.log(`Updating room ${room.title} status to: ${req.body.status}`);
      room.status = req.body.status;
    }

    if (req.body.standardRate) {
      room.pricing = {
        standardRate: Number(req.body.standardRate),
        currency: req.body.currency || "INR",
      };
    }

    if (req.body.planName) {
      room.rates = {
        planName: req.body.planName,
        inclusions: req.body.inclusions
          ? req.body.inclusions.split(",").map((i) => i.trim())
          : [],
        depositPolicy: req.body.depositPolicy,
      };
    }

    await room.save();

    // ✅ Sync Room Instances if totalRooms changed
    if (req.body.totalRooms || req.body.availableRooms) {
      const newTotal = Number(req.body.totalRooms || req.body.availableRooms);
      const currentInstances = await RoomInstance.find({ roomListing: room._id }).sort({ roomNumber: 1 });
      const currentCount = currentInstances.length;

      if (newTotal > currentCount) {
        // Add more instances with proper prefix
        const toAdd = newTotal - currentCount;
        const newInstances = [];

        // Get room type prefix
        const prefixMap = {
          'Single': 'S',
          'Double': 'D',
          'Twin': 'T',
          'Deluxe': 'DX',
          'Suite': 'SU',
          'Family': 'F',
          'Standard': 'ST',
          'Executive': 'E',
          'Presidential': 'P'
        };
        const prefix = prefixMap[room.roomType] || room.roomType.charAt(0).toUpperCase();

        // Find the last room number to continue sequence
        let lastNum = 100; // Start from 101
        if (currentCount > 0) {
          // Extract number from last room (e.g., "D-105" -> 105)
          const lastRoom = currentInstances[currentInstances.length - 1];
          const match = lastRoom.roomNumber.match(/\d+$/);
          if (match) {
            lastNum = parseInt(match[0]);
          }
        }

        // Create new instances
        for (let i = 1; i <= toAdd; i++) {
          newInstances.push({
            roomListing: room._id,
            roomNumber: `${prefix}-${lastNum + i}`,
            status: 'FREE'
          });
        }
        await RoomInstance.insertMany(newInstances);
        console.log(`✅ Added ${toAdd} room instances: ${prefix}-${lastNum + 1} to ${prefix}-${lastNum + toAdd}`);

      } else if (newTotal < currentCount) {
        // Remove excess (prefer FREE ones from the end)
        const toRemove = currentCount - newTotal;
        const freeInstances = currentInstances.filter(i => i.status === 'FREE').reverse();

        let removedCount = 0;
        for (const inst of freeInstances) {
          if (removedCount >= toRemove) break;
          await RoomInstance.findByIdAndDelete(inst._id);
          removedCount++;
        }
        console.log(`✅ Removed ${removedCount} room instances`);
        // Note: We do not delete occupied rooms to prevent data inconsistency
      }
    }

    res.json(room);
  } catch (err) {
    console.error("ADMIN UPDATE ROOM ERROR:", err);
    res.status(500).json({ message: err.message });
  }
});

/* ======================================================
   DELETE ROOM IMAGE (ADMIN)
====================================================== */
router.delete("/:id/images", async (req, res) => {
  try {
    const { image } = req.body;
    const room = await Room.findById(req.params.id);
    if (!room) {
      return res.status(404).json({ message: "Room not found" });
    }

    const wasPrimary = room.image === image;
    room.images = room.images.filter((img) => img !== image);

    if (room.images.length === 0) {
      room.image = "";
      room.public_id = "";
    } else if (wasPrimary) {
      room.image = room.images[0];
    }

    await room.save();

    if (typeof image === "string" && image.includes("res.cloudinary.com")) {
      const publicId = getCloudinaryPublicId(image);
      if (publicId) {
        await deleteFromCloudinary(publicId);
      }
    }

    res.json({ success: true, images: room.images });
  } catch (err) {
    console.error("ADMIN DELETE IMAGE ERROR:", err);
    res.status(500).json({ message: err.message });
  }
});

/* ======================================================
   DELETE ROOM (ADMIN) - Hard delete with instances
====================================================== */
router.delete("/:id", async (req, res) => {
  try {
    const roomId = req.params.id;

    // First, check if room exists
    const room = await Room.findById(roomId);
    if (!room) {
      return res.status(404).json({ message: "Room not found" });
    }

    // Delete all room instances associated with this room listing
    const RoomInstance = require("../models/RoomInstance");
    const deletedInstances = await RoomInstance.deleteMany({ roomListing: roomId });
    console.log(`Deleted ${deletedInstances.deletedCount} room instances`);

    if (room.public_id) {
      await deleteFromCloudinary(room.public_id);
    }

    if (room.images?.length) {
      for (const imageUrl of room.images) {
        if (typeof imageUrl === "string" && imageUrl.includes("res.cloudinary.com")) {
          const publicId = getCloudinaryPublicId(imageUrl);
          if (publicId) {
            await deleteFromCloudinary(publicId);
          }
        }
      }
    }

    await Room.findByIdAndDelete(roomId);

    res.json({
      success: true,
      message: "Room and all instances deleted successfully",
      deletedInstances: deletedInstances.deletedCount
    });
  } catch (err) {
    console.error("ADMIN DELETE ROOM ERROR:", err);
    res.status(500).json({ message: err.message || "Server error" });
  }
});

/* ======================================================
   REGENERATE ALL ROOM INSTANCES (ADMIN UTILITY)
====================================================== */
const RoomInstance = require("../models/RoomInstance");

router.post("/regenerate-instances", async (req, res) => {
  try {
    // Get all active rooms
    const rooms = await Room.find({ status: "active" });

    let created = 0;
    let skipped = 0;

    for (const room of rooms) {
      // Check if instances already exist
      const existingCount = await RoomInstance.countDocuments({ roomListing: room._id });

      if (existingCount === 0 && room.totalRooms > 0) {
        // Create instances
        await createRoomInstancesForListing(room._id, room.totalRooms);
        created += room.totalRooms;
      } else {
        skipped += existingCount;
      }
    }

    res.json({
      success: true,
      message: `Created ${created} new room instances. ${skipped} already existed.`,
      created,
      skipped
    });
  } catch (err) {
    console.error("REGENERATE INSTANCES ERROR:", err);
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
