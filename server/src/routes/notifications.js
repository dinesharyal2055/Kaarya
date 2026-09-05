/**
 * Notifications routes — list, mark read, mark all read
 */
const express = require('express');
const router = express.Router();
const { getDb, save } = require('../db');
const { requireAuth } = require('../middleware/auth');

/* ─── Helper ─────────────────────────────────────────────────────────── */

/**
 * Create a notification for a user.
 * @param {import('sql.js').Database} db
 * @param {number|string} userId
 * @param {string} type  — e.g. 'new_offer', 'offer_accepted'
 * @param {string} title
 * @param {string} body
 * @param {object} [data] — extra payload (jobId, offerId, etc.)
 * @returns {object} the created notification
 */
function createNotification(db, userId, type, title, body, data = {}) {
  db.run(
    `INSERT INTO notifications (user_id, type, title, body, data)
     VALUES (?, ?, ?, ?, ?)`,
    [userId, type, title, body, JSON.stringify(data)]
  );

  const result = db.exec('SELECT last_insert_rowid()');
  const id = result[0].values[0][0];

  return { id, userId: String(userId), type, title, body, data, isRead: false, createdAt: new Date().toISOString() };
}

/* ─── Create (for testing) ─────────────────────────────────────────────── */

// POST /api/notifications — create a notification for the current user (dev/testing)
router.post('/', requireAuth, async (req, res) => {
  try {
    const { type, title, body, data } = req.body;
    if (!type || !title) {
      return res.status(400).json({ error: 'type and title are required' });
    }

    const db = await getDb();
    db.run(
      `INSERT INTO notifications (user_id, type, title, body, data) VALUES (?, ?, ?, ?, ?)`,
      [req.userId, type, title, body || '', JSON.stringify(data || {})]
    );
    save();

    res.status(201).json({ message: 'Notification created' });
  } catch (err) {
    console.error('[/api/notifications POST]', err);
    res.status(500).json({ error: 'Failed to create notification' });
  }
});

/* ─── List ────────────────────────────────────────────────────────────── */

// GET /api/notifications
router.get('/', requireAuth, async (req, res) => {
  try {
    const userId = req.userId;
    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;

    const db = await getDb();

    // Unread count
    const unreadResult = db.exec(
      `SELECT COUNT(*) FROM notifications WHERE user_id = ? AND is_read = 0`,
      [userId]
    );
    const unreadCount = unreadResult.length > 0 ? unreadResult[0].values[0][0] : 0;

    // Notifications list
    const result = db.exec(
      `SELECT id, user_id, type, title, body, data, is_read, created_at
       FROM notifications
       WHERE user_id = ?
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`,
      [userId, limit, offset]
    );

    const notifications = [];
    if (result.length > 0) {
      for (const row of result[0].values) {
        notifications.push({
          id: String(row[0]),
          userId: String(row[1]),
          type: row[2],
          title: row[3],
          body: row[4] || '',
          data: row[5] ? JSON.parse(row[5]) : {},
          read: row[6] === 1,
          createdAt: row[7],
        });
      }
    }

    res.json({ notifications, unreadCount });
  } catch (err) {
    console.error('[/api/notifications GET]', err);
    res.status(500).json({ error: 'Failed to fetch notifications' });
  }
});

/* ─── Mark single as read ────────────────────────────────────────────── */

// PUT /api/notifications/:id
router.put('/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.userId;

    const db = await getDb();

    // Verify ownership
    const owner = db.exec(
      `SELECT id FROM notifications WHERE id = ? AND user_id = ?`,
      [id, userId]
    );
    if (owner.length === 0 || owner[0].values.length === 0) {
      return res.status(404).json({ error: 'Notification not found' });
    }

    db.run(`UPDATE notifications SET is_read = 1 WHERE id = ?`, [id]);
    save();

    // Fetch updated
    const result = db.exec(
      `SELECT id, user_id, type, title, body, data, is_read, created_at
       FROM notifications WHERE id = ?`,
      [id]
    );
    const row = result[0].values[0];
    res.json({
      id: String(row[0]),
      userId: String(row[1]),
      type: row[2],
      title: row[3],
      body: row[4] || '',
      data: row[5] ? JSON.parse(row[5]) : {},
      read: true,
      createdAt: row[6],
    });
  } catch (err) {
    console.error('[/api/notifications/:id PUT]', err);
    res.status(500).json({ error: 'Failed to mark notification as read' });
  }
});

/* ─── Mark all as read ───────────────────────────────────────────────── */

// PUT /api/notifications/read-all
router.put('/read-all', requireAuth, async (req, res) => {
  try {
    const userId = req.userId;
    const db = await getDb();

    db.run(`UPDATE notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0`, [userId]);
    save();

    res.json({ message: 'All notifications marked as read' });
  } catch (err) {
    console.error('[/api/notifications/read-all PUT]', err);
    res.status(500).json({ error: 'Failed to mark all notifications as read' });
  }
});

module.exports = router;
module.exports.createNotification = createNotification;
