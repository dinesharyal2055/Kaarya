/**
 * Notifications routes — list, mark read, mark all read
 */
const express = require('express');
const router = express.Router();
const { getDb, save, usePostgres } = require('../db');
const { requireAuth } = require('../middleware/auth');

/* ─── Helper ─────────────────────────────────────────────────────────── */

/**
 * Create a notification for a user.
 */
function createNotification(db, userId, type, title, body, data = {}) {
  if (usePostgres) {
    db.query(
      `INSERT INTO notifications (user_id, type, title, body, data)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [userId, type, title, body, JSON.stringify(data)]
    ).then(res => {
      const id = res.rows[0].id;
      return { id, userId: String(userId), type, title, body, data, isRead: false, createdAt: new Date().toISOString() };
    }).catch(err => {
      console.error('[postgres/createNotification]', err.message);
    });
  } else {
    db.run(
      `INSERT INTO notifications (user_id, type, title, body, data)
       VALUES (?, ?, ?, ?, ?)`,
      [userId, type, title, body, JSON.stringify(data)]
    );
    const result = db.exec('SELECT last_insert_rowid()');
    const id = result[0].values[0][0];
    return { id, userId: String(userId), type, title, body, data, isRead: false, createdAt: new Date().toISOString() };
  }
}

/* ─── Create (for testing) ─────────────────────────────────────────────── */

router.post('/', requireAuth, async (req, res) => {
  try {
    const { type, title, body, data } = req.body;
    if (!type || !title) {
      return res.status(400).json({ error: 'type and title are required' });
    }

    const db = await getDb();
    if (usePostgres) {
      await db.query(
        `INSERT INTO notifications (user_id, type, title, body, data) VALUES ($1, $2, $3, $4, $5)`,
        [req.userId, type, title, body || '', JSON.stringify(data || {})]
      );
    } else {
      db.run(
        `INSERT INTO notifications (user_id, type, title, body, data) VALUES (?, ?, ?, ?, ?)`,
        [req.userId, type, title, body || '', JSON.stringify(data || {})]
      );
      save();
    }

    res.status(201).json({ message: 'Notification created' });
  } catch (err) {
    console.error('[/api/notifications POST]', err);
    res.status(500).json({ error: 'Failed to create notification' });
  }
});

/* ─── List ────────────────────────────────────────────────────────────── */

router.get('/', requireAuth, async (req, res) => {
  try {
    const userId = req.userId;
    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;

    const db = await getDb();

    if (usePostgres) {
      const countRes = await db.query(
        `SELECT COUNT(*) FROM notifications WHERE user_id = $1 AND is_read = FALSE`,
        [userId]
      );
      const unreadCount = parseInt(countRes.rows[0].count, 10);

      const listRes = await db.query(
        `SELECT id, user_id, type, title, body, data, is_read, created_at
         FROM notifications
         WHERE user_id = $1
         ORDER BY created_at DESC
         LIMIT $2 OFFSET $3`,
        [userId, limit, offset]
      );

      const notifications = listRes.rows.map(row => ({
        id: String(row.id),
        userId: String(row.user_id),
        type: row.type,
        title: row.title,
        body: row.body || '',
        data: row.data ? JSON.parse(row.data) : {},
        read: row.is_read === true,
        createdAt: row.created_at,
      }));

      res.json({ notifications, unreadCount });

    } else {
      // SQLite
      const unreadResult = db.exec(
        `SELECT COUNT(*) FROM notifications WHERE user_id = ? AND is_read = 0`,
        [userId]
      );
      const unreadCount = unreadResult.length > 0 ? unreadResult[0].values[0][0] : 0;

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
    }
  } catch (err) {
    console.error('[/api/notifications GET]', err);
    res.status(500).json({ error: 'Failed to fetch notifications' });
  }
});

/* ─── Mark single as read ────────────────────────────────────────────── */

router.put('/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.userId;
    const db = await getDb();

    if (usePostgres) {
      const ownerRes = await db.query(
        `SELECT id FROM notifications WHERE id = $1 AND user_id = $2`,
        [id, userId]
      );
      if (ownerRes.rowCount === 0) return res.status(404).json({ error: 'Notification not found' });

      await db.query(`UPDATE notifications SET is_read = TRUE WHERE id = $1`, [id]);

      const resRow = await db.query(
        `SELECT id, user_id, type, title, body, data, is_read, created_at
         FROM notifications WHERE id = $1`,
        [id]
      );
      const row = resRow.rows[0];
      res.json({
        id: String(row.id),
        userId: String(row.user_id),
        type: row.type,
        title: row.title,
        body: row.body || '',
        data: row.data ? JSON.parse(row.data) : {},
        read: true,
        createdAt: row.created_at,
      });

    } else {
      const owner = db.exec(
        `SELECT id FROM notifications WHERE id = ? AND user_id = ?`,
        [id, userId]
      );
      if (owner.length === 0 || owner[0].values.length === 0) return res.status(404).json({ error: 'Notification not found' });

      db.run(`UPDATE notifications SET is_read = 1 WHERE id = ?`, [id]);
      save();

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
    }
  } catch (err) {
    console.error('[/api/notifications/:id PUT]', err);
    res.status(500).json({ error: 'Failed to mark notification as read' });
  }
});

/* ─── Mark all as read ───────────────────────────────────────────────── */

router.put('/read-all', requireAuth, async (req, res) => {
  try {
    const userId = req.userId;
    const db = await getDb();

    if (usePostgres) {
      await db.query(`UPDATE notifications SET is_read = TRUE WHERE user_id = $1 AND is_read = FALSE`, [userId]);
    } else {
      db.run(`UPDATE notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0`, [userId]);
      save();
    }

    res.json({ message: 'All notifications marked as read' });
  } catch (err) {
    console.error('[/api/notifications/read-all PUT]', err);
    res.status(500).json({ error: 'Failed to mark all notifications as read' });
  }
});

module.exports = router;
module.exports.createNotification = createNotification;
