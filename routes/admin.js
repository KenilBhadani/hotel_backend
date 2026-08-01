const express = require("express");
const router = express.Router();
const Room = require("../models/RoomListing");

// GET all active rooms
router.get("/", async (req, res) => {
  const rooms = await Room.find({ isActive: true }).sort({ createdAt: -1 });
  res.json(rooms);
});

// CREATE room
router.post("/", async (req, res) => {
  try {
    const room = await Room.create(req.body);
    res.json(room);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// UPDATE room (status / details)
router.put("/:id", async (req, res) => {
  const room = await Room.findByIdAndUpdate(req.params.id, req.body, {
    new: true
  });
  res.json(room);
});

// SOFT DELETE room
router.delete("/:id", async (req, res) => {
  await Room.findByIdAndUpdate(req.params.id, { isActive: false });
  res.json({ success: true });
});

module.exports = router;
