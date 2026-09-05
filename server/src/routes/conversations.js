const express = require('express');
const { getDb, save } = require('../db');
const { requireAuth } = require('../middleware/auth');
const { createNotification } = require('./notifications');

const router = express.Router();

// Helper: check if user is a participant in a conversation
async function isParticipant(db, conversationId, userId) {
  const result = db.exec(
    'SELECT 1 FROM conversation_participants WHERE conversation_id = ? AND user_id = ?',
    [conversationId, userId]
  );
  return result.length > 0 && result[0].values.length > 0;
}

// Helper: get participant user info
async function getParticipantInfo(db, conversationId) {
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

// GET /api/conversations — list user's conversations
// Query param: jobId=X — returns the conversation for a specific job (if exists)
router.get('/', requireAuth, async (req, res) => {
  try {
    const db = await getDb();
    const { jobId } = req.query;

    // If jobId provided, return only that conversation (or null)
    if (jobId) {
      const result = db.exec(
        `SELECT c.id, c.job_id, c.created_at, c.updated_at
         FROM conversations c
         JOIN conversation_participants cp ON cp.conversation_id = c.id
         WHERE c.job_id = ? AND cp.user_id = ?`,
        [jobId, req.userId]
      );

      if (result.length === 0 || result[0].values.length === 0) {
        return res.json({ data: null });
      }

      const row = result[0].values[0];
      const convId = row[0];
      const jId = row[1];
      const createdAt = row[2];
      const updatedAt = row[3];

      let jobTitle = null;
      if (jId) {
        const jobResult = db.exec('SELECT title FROM jobs WHERE id = ?', [jId]);
        if (jobResult.length > 0 && jobResult[0].values.length > 0) {
          jobTitle = jobResult[0].values[0][0];
        }
      }
      const participants = await getParticipantInfo(db, convId);

      let lastMessage = null;
      const msgResult = db.exec(
        `SELECT id, sender_id, content, is_read, created_at
         FROM messages
         WHERE conversation_id = ?
         ORDER BY created_at DESC
         LIMIT 1`,
        [convId]
      );
      if (msgResult.length > 0 && msgResult[0].values.length > 0) {
        const msgRow = msgResult[0].values[0];
        lastMessage = {
          id: msgRow[0],
          senderId: msgRow[1],
          text: msgRow[2],
          readAt: msgRow[3] === 1 ? msgRow[4] : null,
          createdAt: msgRow[4],
        };
      }

      const unreadResult = db.exec(
        `SELECT COUNT(*) FROM messages
         WHERE conversation_id = ? AND sender_id != ? AND is_read = 0`,
        [convId, req.userId]
      );
      const unreadCount = unreadResult.length > 0 ? unreadResult[0].values[0][0] : 0;

      return res.json({
        data: {
          id: convId,
          jobId: jId || null,
          jobTitle,
          participants,
          lastMessage,
          unreadCount,
          createdAt,
          updatedAt,
        },
      });
    }

    // Otherwise, return all conversations for this user
    const result = db.exec(
      `SELECT c.id, c.job_id, c.created_at, c.updated_at
       FROM conversations c
       JOIN conversation_participants cp ON cp.conversation_id = c.id
       WHERE cp.user_id = ?
       ORDER BY c.updated_at DESC`,
      [req.userId]
    );

    const conversations = [];

    if (result.length > 0) {
      for (const row of result[0].values) {
        const convId = row[0];
        const jobId = row[1];
        const createdAt = row[2];
        const updatedAt = row[3];

        // Get job title
        let jobTitle = null;
        if (jobId) {
          const jobResult = db.exec('SELECT title FROM jobs WHERE id = ?', [jobId]);
          if (jobResult.length > 0 && jobResult[0].values.length > 0) {
            jobTitle = jobResult[0].values[0][0];
          }
        }

        // Get participants
        const participants = await getParticipantInfo(db, convId);

        // Get last message
        let lastMessage = null;
        const msgResult = db.exec(
          `SELECT id, sender_id, content, is_read, created_at
           FROM messages
           WHERE conversation_id = ?
           ORDER BY created_at DESC
           LIMIT 1`,
          [convId]
        );
        if (msgResult.length > 0 && msgResult[0].values.length > 0) {
          const msgRow = msgResult[0].values[0];
          lastMessage = {
            id: msgRow[0],
            senderId: msgRow[1],
            text: msgRow[2],
            readAt: msgRow[3] === 1 ? msgRow[4] : null,
            createdAt: msgRow[4],
          };
        }

        // Get unread count (messages not from this user and not read)
        const unreadResult = db.exec(
          `SELECT COUNT(*) FROM messages
           WHERE conversation_id = ? AND sender_id != ? AND is_read = 0`,
          [convId, req.userId]
        );
        const unreadCount = unreadResult.length > 0 ? unreadResult[0].values[0][0] : 0;

        conversations.push({
          id: convId,
          jobId: jobId || null,
          jobTitle,
          participants,
          lastMessage,
          unreadCount,
          createdAt,
          updatedAt,
        });
      }
    }

    res.json({ data: conversations });
  } catch (err) {
    console.error('[conversations/list]', err);
    res.status(500).json({ error: 'Failed to list conversations' });
  }
});

// GET /api/conversations/:id — get conversation details
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const db = await getDb();

    const result = db.exec(
      `SELECT c.id, c.job_id, c.created_at
       FROM conversations c
       WHERE c.id = ?`,
      [id]
    );

    if (result.length === 0 || result[0].values.length === 0) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    // Check participant
    const participant = await isParticipant(db, id, req.userId);
    if (!participant) {
      return res.status(403).json({ error: 'Access denied — not a participant' });
    }

    const row = result[0].values[0];
    const convId = row[0];
    const jobId = row[1];
    const createdAt = row[2];

    // Get job title
    let jobTitle = null;
    if (jobId) {
      const jobResult = db.exec('SELECT title FROM jobs WHERE id = ?', [jobId]);
      if (jobResult.length > 0 && jobResult[0].values.length > 0) {
        jobTitle = jobResult[0].values[0][0];
      }
    }

    // Get participants
    const participants = await getParticipantInfo(db, convId);

    res.json({
      data: {
        id: convId,
        jobId: jobId || null,
        jobTitle,
        participants,
        createdAt,
      },
    });
  } catch (err) {
    console.error('[conversations/get]', err);
    res.status(500).json({ error: 'Failed to fetch conversation' });
  }
});

// GET /api/conversations/:id/messages — get messages, mark as read
router.get('/:id/messages', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const db = await getDb();

    // Check conversation exists
    const convResult = db.exec('SELECT id FROM conversations WHERE id = ?', [id]);
    if (convResult.length === 0 || convResult[0].values.length === 0) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    // Check participant
    const participant = await isParticipant(db, id, req.userId);
    if (!participant) {
      return res.status(403).json({ error: 'Access denied — not a participant' });
    }

    // Mark messages as read (not from this user)
    db.run(
      'UPDATE messages SET is_read = 1 WHERE conversation_id = ? AND sender_id != ? AND is_read = 0',
      [id, req.userId]
    );

    // Get messages
    const result = db.exec(
      `SELECT id, conversation_id, sender_id, content, is_read, created_at
       FROM messages
       WHERE conversation_id = ?
       ORDER BY created_at ASC`,
      [id]
    );

    const messages = [];
    if (result.length > 0) {
      for (const row of result[0].values) {
        messages.push({
          id: row[0],
          conversationId: row[1],
          senderId: row[2],
          text: row[3],
          readAt: row[4] === 1 ? row[5] : null,
          createdAt: row[5],
        });
      }
    }

    res.json({ data: messages });
  } catch (err) {
    console.error('[conversations/messages]', err);
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

// POST /api/conversations/:id/messages — send message
router.post('/:id/messages', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { text } = req.body;

    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      return res.status(400).json({ error: 'Missing or invalid required field: text' });
    }

    const db = await getDb();

    // Check conversation exists
    const convResult = db.exec('SELECT id FROM conversations WHERE id = ?', [id]);
    if (convResult.length === 0 || convResult[0].values.length === 0) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    // Check participant
    const participant = await isParticipant(db, id, req.userId);
    if (!participant) {
      return res.status(403).json({ error: 'Access denied — not a participant' });
    }

    const content = text.trim();

    // Insert message — mark as read by sender immediately
    db.run(
      'INSERT INTO messages (conversation_id, sender_id, content, is_read) VALUES (?, ?, ?, 1)',
      [id, req.userId, content]
    );

    const newId = db.exec('SELECT last_insert_rowid()')[0].values[0][0];

    // Get the created message
    const result = db.exec(
      `SELECT id, conversation_id, sender_id, content, is_read, created_at
       FROM messages WHERE id = ?`,
      [newId]
    );

    if (result.length === 0 || result[0].values.length === 0) {
      return res.status(500).json({ error: 'Failed to retrieve created message' });
    }

    const row = result[0].values[0];

    // Update conversation updated_at
    db.run('UPDATE conversations SET updated_at = datetime("now") WHERE id = ?', [id]);
    save();

    // Notify the other participant(s)
    const otherParticipants = db.exec(
      `SELECT user_id FROM conversation_participants WHERE conversation_id = ? AND user_id != ?`,
      [id, req.userId]
    );
    if (otherParticipants.length > 0 && otherParticipants[0].values.length > 0) {
      for (const row of otherParticipants[0].values) {
        const recipientId = row[0];
        createNotification(db, recipientId, 'new_message',
          'New message',
          content.length > 60 ? content.substring(0, 57) + '…' : content,
          { conversationId: String(id) }
        );
      }
      save();
    }

    const message = {
      id: row[0],
      conversationId: row[1],
      senderId: row[2],
      text: row[3],
      readAt: row[4] === 1 ? row[5] : null,
      createdAt: row[5],
    };

    res.status(201).json({ data: message });
  } catch (err) {
    console.error('[conversations/sendMessage]', err);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

module.exports = router;
