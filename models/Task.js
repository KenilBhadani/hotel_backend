const mongoose = require('mongoose');

const taskSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  description: { type: String, trim: true },
  category: { type: String, enum: ['Maintenance', 'Housekeeping', 'Other'], default: 'Housekeeping' },
  assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'Staff' },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Staff' },
  roomId: { type: mongoose.Schema.Types.ObjectId, ref: 'RoomListing' },
  location: { type: String },
  status: { type: String, enum: ['Pending', 'In Progress', 'Completed', 'Cancelled'], default: 'Pending' },
  priority: { type: String, enum: ['Low', 'Medium', 'High'], default: 'Medium' },
  dueDate: { type: Date },
  completedAt: { type: Date },
  tags: [String],
  comments: [{ by: { type: mongoose.Schema.Types.ObjectId, ref: 'Staff' }, comment: String, createdAt: Date }],
  history: [{ action: String, by: { type: mongoose.Schema.Types.ObjectId, ref: 'Staff' }, note: String, createdAt: { type: Date, default: Date.now } }],
}, { timestamps: true });

module.exports = mongoose.models.Task || mongoose.model('Task', taskSchema);
