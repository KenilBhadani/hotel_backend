const express = require('express');
const router = express.Router();
const Task = require('../models/Task');
const Staff = require('../models/Staff');
const verifyStaff = require('../middleware/verifyStaff');
const sendEmail = require('../utils/sendEmail');

// GET /api/staff/tasks - list with filters
router.get('/', verifyStaff, async (req, res) => {
  try {
    const { status, priority, assignedTo, search, page = 1, limit = 100 } = req.query;
    const filter = {};
    if (status) filter.status = status;
    if (priority) filter.priority = priority;
    if (assignedTo) filter.assignedTo = assignedTo;
    if (search) filter.$or = [
      { title: { $regex: search, $options: 'i' } },
      { description: { $regex: search, $options: 'i' } }
    ];

    // Role-based filtering
    if (req.user.role === 'Housekeeping') {
      filter.assignedTo = req.user.userId || req.user.id;
    }
    if (req.user.role === 'Maintenance') {
      filter.assignedTo = req.user.userId || req.user.id;
    }
    // Manager, Admin, Receptionist see all tasks

    const tasks = await Task.find(filter)
      .populate('assignedTo', 'name email role')
      .populate('roomId', 'title roomType number')
      .sort({ priority: -1, createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit));

    const total = await Task.countDocuments(filter);

    res.json({ tasks, total, page: Number(page), limit: Number(limit) });
  } catch (err) {
    console.error('TASKS LIST ERROR', err);
    res.status(500).json({ message: 'Failed to list tasks' });
  }
});

// GET staff list (lightweight) for assignment dropdown
router.get('/staff', verifyStaff, async (_req, res) => {
  try {
    // return only roles that can be assigned tasks
    const assignableRoles = ['Housekeeping', 'Maintenance', 'Receptionist', 'Manager'];
    const staff = await Staff.find({ isActive: true, role: { $in: assignableRoles } }).select('name role email');
    res.json(staff.map(s => ({ _id: s._id, name: s.name, role: s.role, email: s.email })));
  } catch (err) {
    console.error('GET STAFF ERROR', err);
    res.status(500).json({ message: 'Failed to load staff list' });
  }
});

// POST /api/staff/tasks - create
router.post('/', verifyStaff, async (req, res) => {
  try {
    const { title, description, priority = 'Medium', assignedTo, category, location, roomId, dueDate, tags = [] } = req.body;
    // validation
    if (!title) return res.status(400).json({ message: 'Title required' });

    // Permission: Receptionist, Manager, Admin can create tasks; Housekeeping can create personal tasks
    if (!['Receptionist', 'Manager', 'Housekeeping', 'Admin', 'admin'].includes(req.user.role)) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const doc = new Task({
      title,
      description,
      priority,
      category,
      location,
      roomId,
      tags,
      createdBy: req.user.userId || req.user.id,
      status: 'Pending'
    });

    if (dueDate) doc.dueDate = new Date(dueDate);

    // Assignment logic
    if (assignedTo) {
      // Manager/Receptionist/Admin may assign anyone; Housekeeping may assign only to self
      if (!['Manager', 'Receptionist', 'Admin', 'admin'].includes(req.user.role)) {
        const userId = req.user.userId || req.user.id;
        if (req.user.role === 'Housekeeping' && String(assignedTo) === String(userId)) {
          doc.assignedTo = assignedTo;
        } else {
          return res.status(403).json({ message: 'Not allowed to assign' });
        }
      } else {
        doc.assignedTo = assignedTo;
      }
    } else if (req.user.role === 'Housekeeping') {
      // Housekeeping auto-assign to self
      doc.assignedTo = req.user.userId || req.user.id;
    }

    await doc.save();

    // history
    doc.history.push({ action: 'created', by: req.user.userId || req.user.id, note: 'Task created' });
    await doc.save();

    // notify assignee via email if present
    if (doc.assignedTo) {
      try {
        const staff = await Staff.findById(doc.assignedTo);
        if (staff && staff.email) {
          await sendEmail({
            to: staff.email,
            subject: `New Task Assigned: ${doc.title}`,
            html: `<p>Hi ${staff.name},</p><p>You have been assigned a new task: <strong>${doc.title}</strong></p><p>${doc.description || ''}</p>`
          });
        }
      } catch (e) {
        console.error('Email notify failed', e.message);
      }
    }

    // return populated task so frontend shows assignee details immediately
    const saved = await Task.findById(doc._id).populate('assignedTo', 'name role email');
    res.status(201).json({ task: saved });
  } catch (err) {
    console.error('CREATE TASK ERROR', err);
    res.status(500).json({ message: 'Failed to create task' });
  }
});

// PATCH /api/staff/tasks/:id - update fields or assign
router.patch('/:id', verifyStaff, async (req, res) => {
  try {
    const { id } = req.params;
    const patch = req.body; // allowed: title, description, priority, assignedTo, status, dueDate, tags
    const task = await Task.findById(id);
    if (!task) return res.status(404).json({ message: 'Task not found' });

    // authorization: only Manager, Admin, or Receptionist can assign tasks
    if (patch.assignedTo && !['Manager', 'Receptionist', 'Admin', 'admin'].includes(req.user.role)) {
      return res.status(403).json({ message: 'Not allowed to assign' });
    }

    if (patch.title) task.title = patch.title;
    if (patch.description) task.description = patch.description;
    if (patch.priority) task.priority = patch.priority;
    if (patch.status) task.status = patch.status;
    if (patch.dueDate) task.dueDate = new Date(patch.dueDate);
    if (patch.tags) task.tags = patch.tags;

    if (patch.assignedTo && String(task.assignedTo) !== String(patch.assignedTo)) {
      const old = task.assignedTo;
      task.assignedTo = patch.assignedTo;
      task.history.push({ action: 'reassigned', by: req.user.userId || req.user.id, note: `from:${old} to:${patch.assignedTo}` });

      // notify new assignee
      try {
        const staff = await Staff.findById(task.assignedTo);
        if (staff && staff.email) {
          await sendEmail({
            to: staff.email,
            subject: `Task Assigned: ${task.title}`,
            html: `<p>Hi ${staff.name},</p><p>You have been assigned a task: <strong>${task.title}</strong></p>`
          });
        }
      } catch (e) {
        console.error('Email notify failed', e.message);
      }
    }

    task.history.push({ action: 'updated', by: req.user.userId || req.user.id, note: JSON.stringify(patch) });

    await task.save();
    res.json({ task });
  } catch (err) {
    console.error('UPDATE TASK ERROR', err);
    res.status(500).json({ message: 'Failed to update task' });
  }
});

// PATCH /api/staff/tasks/:id/complete - mark complete
router.patch('/:id/complete', verifyStaff, async (req, res) => {
  try {
    const { id } = req.params;
    const task = await Task.findById(id);
    if (!task) return res.status(404).json({ message: 'Task not found' });

    // Only assigned staff or Manager can complete
    const userId = req.user.userId || req.user.id;
    if (String(task.assignedTo) !== String(userId) && req.user.role !== 'Manager' && req.user.role !== 'Admin' && req.user.role !== 'admin') return res.status(403).json({ message: 'Not authorized' });

    task.status = 'Completed';
    task.completedAt = new Date();
    task.history.push({ action: 'completed', by: userId, note: 'Marked complete' });
    await task.save();
    res.json({ task });
  } catch (err) {
    console.error('COMPLETE TASK ERROR', err);
    res.status(500).json({ message: 'Failed to complete task' });
  }
});

// POST /api/staff/tasks/:id/comment - add comment
router.post('/:id/comment', verifyStaff, async (req, res) => {
  try {
    const { id } = req.params;
    const { comment } = req.body;
    if (!comment) return res.status(400).json({ message: 'Comment required' });
    const task = await Task.findById(id);
    if (!task) return res.status(404).json({ message: 'Task not found' });

    const userId = req.user.userId || req.user.id;
    task.comments = task.comments || [];
    task.comments.push({ by: userId, comment, createdAt: new Date() });
    task.history.push({ action: 'comment', by: userId, note: comment });
    await task.save();
    res.json({ task });
  } catch (err) {
    console.error('COMMENT TASK ERROR', err);
    res.status(500).json({ message: 'Failed to add comment' });
  }
});

// DELETE /api/staff/tasks/:id - manager and admin only
router.delete('/:id', verifyStaff, async (req, res) => {
  try {
    if (!['Manager', 'Admin', 'admin'].includes(req.user.role)) return res.status(403).json({ message: 'Only Manager or Admin may delete' });
    const { id } = req.params;
    await Task.findByIdAndDelete(id);
    res.json({ success: true });
  } catch (err) {
    console.error('DELETE TASK ERROR', err);
    res.status(500).json({ message: 'Failed to delete task' });
  }
});

module.exports = router;