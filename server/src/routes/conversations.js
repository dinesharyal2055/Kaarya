const express = require('express');
const { getDb, save, usePostgres } = require('../db');
const { requireAuth } = require('../middleware/auth');
const { createNotification } = require('./notifications');
const { sendToUser } = require('../fcm');
const { validate, sendMessage } = require('../middleware/validate');
const { sanitize } = require('../middleware/sanitize');
const { messagesLimiter } = require('../middleware/rateLimit');

const router = express.Router();

function pushNotify(userId, payload) {
  sendToUser(userId, payload).catch(() => {});
}

async function isParticipant(db, conversationId, userId) {
  if (usePostgres) {
    const res = await db.query(
      'SELECT 1 FROM conversation_participants WHERE conversation_id = $1 AND user_id = $2',
      [conversationId, userId]
    );
    return res.rowCount > 0;
  } else {
    const result = db.exec(
      'SELECT 1 FROM conversation_participants WHERE conversation_id = ? AND user_id = ?',
      [conversationId, userId]
    );
    return result.length > 0 && result[0].values.length > 0;
  }
}

async function getParticipantInfo(db, conversationId) {
  if (usePostgres) {
    const res = await db.query(
      `SELECT u.id, u.name, u.avatar_url, u.role
       FROM conversation_participants cp
       JOIN users u ON u.id = cp.user_id
       WHERE cp.conversation_id = $1`,
      [conversationId]
    );
    return res.rows.map(row => ({
      id: row.id,
      name: row.name,
      avatar: row.avatar_url || null,
      role: row.role,
    }));
  } else {
    const result = db.exec(
      `SELECT u.id, u.name, u.avatar_url, u.role
       FROM conversation_participants cp
       JOIN users u ON u.id = cp.user_id
       WHERE cp.conversation_id = ?`,
      [conversationId]
    );
    if (result.length === 0) return [];
    return result[0].values.map(row => ({
      id: row[0],
      name: row[1],
      avatar: row[2] || null,
      role: row[3],
    }));
  }
}

// GET /api/conversations — list user's conversations
router.get('/', requireAuth, async (req, res) => {
  try {
    const db = await getDb();
    const { jobId } = req.query;

    if (usePostgres) {
      if (jobId) {
        const result = await db.query(
          `SELECT c.id, c.job_id, c.created_at, c.updated_at
           FROM conversations c
           JOIN conversation_participants cp ON cp.conversation_id = c.id
           WHERE c.job_id = $1 AND cp.user_id = $2`,
          [jobId, req.userId]
        );

        if (result.rowCount === 0) return res.json({ data: null });

        const row = result.rows[0];
        const convId = row.id;
        const jId = row.job_id;

        let jobTitle = null;
        if (jId) {
          const jobRes = await db.query('SELECT title FROM jobs WHERE id = $1', [jId]);
          if (jobRes.rowCount > 0) jobTitle = jobRes.rows[0].title;
        }

        const participants = await getParticipantInfo(db, convId);

        let lastMessage = null;
        const msgRes = await db.query(
          `SELECT id, sender_id, content, is_read, created_at
           FROM messages WHERE conversation_id = $1 ORDER BY created_at DESC LIMIT 1`,
          [convId]
        );
        if (msgRes.rowCount > 0) {
          const m = msgRes.rows[0];
          lastMessage = {
            id: m.id, senderId: String(m.sender_id), text: m.content,
            readAt: m.is_read ? m.created_at : null, createdAt: m.created_at,
          };
        }

        const unreadRes = await db.query(
          `SELECT COUNT(*) FROM messages WHERE conversation_id = $1 AND sender_id != $2 AND is_read = FALSE`,
          [convId, req.userId]
        );
        const unreadCount = parseInt(unreadRes.rows[0].count, 10);

        return res.json({
          data: { id: convId, jobId: jId || null, jobTitle, participants, lastMessage, unreadCount, createdAt: row.created_at, updatedAt: row.updated_at },
        });
      }

      // List all
      const result = await db.query(
        `SELECT c.id, c.job_id, c.created_at, c.updated_at
         FROM conversations c
         JOIN conversation_participants cp ON cp.conversation_id = c.id
         WHERE cp.user_id = $1
         ORDER BY c.updated_at DESC`,
        [req.userId]
      );

      const conversations = [];
      for (const row of result.rows) {
        const convId = row.id;
        const jId = row.job_id;

        let jobTitle = null;
        if (jId) {
          const jobRes = await db.query('SELECT title FROM jobs WHERE id = $1', [jId]);
          if (jobRes.rowCount > 0) jobTitle = jobRes.rows[0].title;
        }

        const participants = await getParticipantInfo(db, convId);

        let lastMessage = null;
        const msgRes = await db.query(
          `SELECT id, sender_id, content, is_read, created_at
           FROM messages WHERE conversation_id = $1 ORDER BY created_at DESC LIMIT 1`,
          [convId]
        );
        if (msgRes.rowCount > 0) {
          const m = msgRes.rows[0];
          lastMessage = {
            id: m.id, senderId: String(m.sender_id), text: m.content,
            readAt: m.is_read ? m.created_at : null, createdAt: m.created_at,
          };
        }

        const unreadRes = await db.query(
          `SELECT COUNT(*) FROM messages WHERE conversation_id = $1 AND sender_id != $2 AND is_read = FALSE`,
          [convId, req.userId]
        );
        const unreadCount = parseInt(unreadRes.rows[0].count, 10);

        conversations.push({
          id: convId, jobId: jId || null, jobTitle, participants, lastMessage, unreadCount, createdAt: row.created_at, updatedAt: row.updated_at,
        });
      }

      res.json({ data: conversations });

    } else {
      // SQLite implementation
      if (jobId) {
        const result = db.exec(
          `SELECT c.id, c.job_id, c.created_at, c.updated_at
           FROM conversations c
           JOIN conversation_participants cp ON cp.conversation_id = c.id
           WHERE c.job_id = ? AND cp.user_id = ?`,
          [jobId, req.userId]
        );

        if (result.length === 0 || result[0].values.length === 0) return res.json({ data: null });

        const row = result[0].values[0];
        const convId = row[0];
        const jId = row[1];

        let jobTitle = null;
        if (jId) {
          const jobResult = db.exec('SELECT title FROM jobs WHERE id = ?', [jId]);
          if (jobResult.length > 0 && jobResult[0].values.length > 0) jobTitle = jobResult[0].values[0][0];
        }

        const participants = await getParticipantInfo(db, convId);

        let lastMessage = null;
        const msgResult = db.exec(
          `SELECT id, sender_id, content, is_read, created_at
           FROM messages WHERE conversation_id = ? ORDER BY created_at DESC LIMIT 1`,
          [convId]
        );
        if (msgResult.length > 0 && msgResult[0].values.length > 0) {
          const msgRow = msgResult[0].values[0];
          lastMessage = {
            id: msgRow[0], senderId: String(msgRow[1]), text: msgRow[2],
            readAt: msgRow[3] === 1 ? msgRow[4] : null, createdAt: msgRow[4],
          };
        }

        const unreadResult = db.exec(
          `SELECT COUNT(*) FROM messages WHERE conversation_id = ? AND sender_id != ? AND is_read = 0`,
          [convId, req.userId]
        );
        const unreadCount = unreadResult.length > 0 ? unreadResult[0].values[0][0] : 0;

        return res.json({
          data: { id: convId, jobId: jId || null, jobTitle, participants, lastMessage, unreadCount, createdAt: row[2], updatedAt: row[3] },
        });
      }

      const result = db.exec(
        `SELECT c.id, c.job_id, c.created_at, c.updated_at
         FROM conversations c
         JOIN conversation_participants cp ON cp.conversation_id = c.id
         WHERE cp.user_id = ? ORDER BY c.updated_at DESC`,
        [req.userId]
      );

      const conversations = [];
      if (result.length > 0) {
        for (const row of result[0].values) {
          const convId = row[0];
          const jobId = row[1];

          let jobTitle = null;
          if (jobId) {
            const jobResult = db.exec('SELECT title FROM jobs WHERE id = ?', [jobId]);
            if (jobResult.length > 0 && jobResult[0].values.length > 0) jobTitle = jobResult[0].values[0][0];
          }

          const participants = await getParticipantInfo(db, convId);

          let lastMessage = null;
          const msgResult = db.exec(
            `SELECT id, sender_id, content, is_read, created_at
             FROM messages WHERE conversation_id = ? ORDER BY created_at DESC LIMIT 1`,
            [convId]
          );
          if (msgResult.length > 0 && msgResult[0].values.length > 0) {
            const msgRow = msgResult[0].values[0];
            lastMessage = {
              id: msgRow[0], senderId: String(msgRow[1]), text: msgRow[2],
              readAt: msgRow[3] === 1 ? msgRow[4] : null, createdAt: msgRow[4],
            };
          }

          const unreadResult = db.exec(
            `SELECT COUNT(*) FROM messages WHERE conversation_id = ? AND sender_id != ? AND is_read = 0`,
            [convId, req.userId]
          );
          const unreadCount = unreadResult.length > 0 ? unreadResult[0].values[0][0] : 0;

          conversations.push({
            id: convId, jobId: jobId || null, jobTitle, participants, lastMessage, unreadCount, createdAt: row[2], updatedAt: row[3],
          });
        }
      }

      res.json({ data: conversations });
    }
  } catch (err) {
    console.error('[conversations/list]', err);
    res.status(500).json({ error: 'Failed to list conversations' });
  }
});

// GET /api/conversations/:id/messages
router.get('/:id/messages', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const db = await getDb();

    const participant = await isParticipant(db, id, req.userId);
    if (!participant) return res.status(403).json({ error: 'Access denied — not a participant' });

    if (usePostgres) {
      await db.query(
        'UPDATE messages SET is_read = TRUE WHERE conversation_id = $1 AND sender_id != $2 AND is_read = FALSE',
        [id, req.userId]
      );

      const msgRes = await db.query(
        `SELECT id, conversation_id, sender_id, content, is_read, created_at
         FROM messages WHERE conversation_id = $1 ORDER BY created_at ASC`,
        [id]
      );

      const messages = msgRes.rows.map(row => ({
        id: row.id, conversationId: row.conversation_id, senderId: String(row.sender_id),
        text: row.content, readAt: row.is_read ? row.created_at : null, createdAt: row.created_at,
      }));

      res.json({ data: messages });

    } else {
      db.run(
        'UPDATE messages SET is_read = 1 WHERE conversation_id = ? AND sender_id != ? AND is_read = 0',
        [id, req.userId]
      );

      const result = db.exec(
        `SELECT id, conversation_id, sender_id, content, is_read, created_at
         FROM messages WHERE conversation_id = ? ORDER BY created_at ASC`,
        [id]
      );

      const messages = [];
      if (result.length > 0) {
        for (const row of result[0].values) {
          messages.push({
            id: row[0], conversationId: row[1], senderId: String(row[2]),
            text: row[3], readAt: row[4] === 1 ? row[5] : null, createdAt: row[5],
          });
        }
      }

      res.json({ data: messages });
    }
  } catch (err) {
    console.error('[conversations/messages]', err);
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

// POST /api/conversations/:id/messages
router.post('/:id/messages', messagesLimiter, requireAuth, sanitize('text'), validate(sendMessage), async (req, res) => {
  try {
    const { id } = req.params;
    const { text } = res.locals.parsedBody;
    const db = await getDb();

    const participant = await isParticipant(db, id, req.userId);
    if (!participant) return res.status(403).json({ error: 'Access denied — not a participant' });

    const content = text.trim();

    if (usePostgres) {
      const insRes = await db.query(
        'INSERT INTO messages (conversation_id, sender_id, content, is_read) VALUES ($1, $2, $3, TRUE) RETURNING id, created_at',
        [id, req.userId, content]
      );

      await db.query('UPDATE conversations SET updated_at = NOW() WHERE id = $1', [id]);

      const otherRes = await db.query(
        `SELECT user_id FROM conversation_participants WHERE conversation_id = $1 AND user_id != $2`,
        [id, req.userId]
      );

      if (otherRes.rowCount > 0) {
        const senderRes = await db.query('SELECT name FROM users WHERE id = $1', [req.userId]);
        const senderName = senderRes.rowCount > 0 ? senderRes.rows[0].name : 'Someone';
        const preview = content.length > 60 ? content.substring(0, 57) + '…' : content;

        for (const row of otherRes.rows) {
          createNotification(db, row.user_id, 'new_message', `Message from ${senderName}`, preview, { conversationId: String(id) });
          pushNotify(row.user_id, { title: `Message from ${senderName}`, body: preview, data: { type: 'new_message', conversationId: String(id) } });
        }
      }

      const m = insRes.rows[0];
      const message = {
        id: m.id, conversationId: id, senderId: req.userId, text: content, readAt: m.created_at, createdAt: m.created_at,
      };

      res.status(201).json({ data: message });

    } else {
      // SQLite
      db.run(
        'INSERT INTO messages (conversation_id, sender_id, content, is_read) VALUES (?, ?, ?, 1)',
        [id, req.userId, content]
      );
      const newId = db.exec('SELECT last_insert_rowid()')[0].values[0][0];

      const result = db.exec(
        `SELECT id, conversation_id, sender_id, content, is_read, created_at FROM messages WHERE id = ?`,
        [newId]
      );
      const row = result[0].values[0];

      db.run('UPDATE conversations SET updated_at = datetime("now") WHERE id = ?', [id]);
      save();

      const otherParticipants = db.exec(
        `SELECT user_id FROM conversation_participants WHERE conversation_id = ? AND user_id != ?`,
        [id, req.userId]
      );
      if (otherParticipants.length > 0 && otherParticipants[0].values.length > 0) {
        const senderInfo = db.exec('SELECT name FROM users WHERE id = ?', [req.userId]);
        const senderName = senderInfo.length > 0 ? senderInfo[0].values[0][0] : 'Someone';
        const preview = content.length > 60 ? content.substring(0, 57) + '…' : content;

        for (const r of otherParticipants[0].values) {
          createNotification(db, r[0], 'new_message', `Message from ${senderName}`, preview, { conversationId: String(id) });
          pushNotify(r[0], { title: `Message from ${senderName}`, body: preview, data: { type: 'new_message', conversationId: String(id) } });
        }
        save();
      }

      const message = {
        id: row[0], conversationId: row[1], senderId: row[2], text: row[3], readAt: row[4] === 1 ? row[5] : null, createdAt: row[5],
      };

      res.status(201).json({ data: message });
    }
  } catch (err) {
    console.error('[conversations/sendMessage]', err);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

module.exports = router;
