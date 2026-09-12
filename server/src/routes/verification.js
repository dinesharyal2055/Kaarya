const express = require('express');
const router = express.Router();
const { getDb, save, usePostgres } = require('../db');
const { requireAuth } = require('../middleware/auth');
const storage = require('../storage');

// Upload a verification document image (returns the stored filename)
router.post('/upload', requireAuth, async (req, res) => {
  try {
    const { image, filename } = req.body;
    if (!image || !filename) {
      return res.status(400).json({ error: 'image and filename are required' });
    }

    const base64Data = image.replace(/^data:image\/\w+;base64,/, '');
    let buffer;
    try {
      buffer = Buffer.from(base64Data, 'base64');
    } catch {
      return res.status(400).json({ error: 'Invalid base64 image data' });
    }

    if (buffer.length > 10 * 1024 * 1024) {
      return res.status(400).json({ error: 'Image too large (max 10MB)' });
    }

    const mime = req.body.mime || 'image/jpeg';
    const ext = mime === 'image/png' ? 'png' : 'jpg';
    const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
    const storedFilename = `${Date.now()}_${safeName}.${ext}`;

    await storage.saveVerificationImage({
      filename: storedFilename,
      buffer,
      contentType: mime,
    });

    const url = `/uploads/verification/${storedFilename}`;
    res.json({ url, filename: storedFilename, size: buffer.length });
  } catch (err) {
    console.error('[/api/verification/upload]', err);
    res.status(500).json({ error: 'Failed to upload image' });
  }
});

// Submit a verification request
router.post('/submit', requireAuth, async (req, res) => {
  try {
    const { level, documentType, documents, notes } = req.body;
    const userId = req.userId;

    if (!level || !documentType || !documents || !Array.isArray(documents) || documents.length === 0) {
      return res.status(400).json({ error: 'level, documentType, and at least one document are required' });
    }

    const db = await getDb();

    if (usePostgres) {
      const existing = await db.query(
        `SELECT id, status FROM verification_requests WHERE user_id = $1 ORDER BY id DESC LIMIT 1`,
        [userId]
      );
      if (existing.rowCount > 0) {
        if (existing.rows[0].status === 'pending') return res.status(400).json({ error: 'You already have a pending verification request' });
        if (existing.rows[0].status === 'approved') return res.status(400).json({ error: 'Your account is already verified' });
      }

      const insRes = await db.query(
        `INSERT INTO verification_requests (user_id, level, document_type, documents, notes, status)
         VALUES ($1, $2, $3, $4, $5, 'pending') RETURNING id`,
        [userId, level, documentType, JSON.stringify(documents), notes || null]
      );

      await db.query('UPDATE users SET is_verified = FALSE, updated_at = NOW() WHERE id = $1', [userId]);

      const reqRes = await db.query(
        `SELECT * FROM verification_requests WHERE id = $1`,
        [insRes.rows[0].id]
      );
      const request = {
        ...reqRes.rows[0],
        documents: typeof reqRes.rows[0].documents === 'string' ? JSON.parse(reqRes.rows[0].documents) : reqRes.rows[0].documents,
        adminNotes: reqRes.rows[0].admin_notes ?? undefined,
      };

      res.json(request);

    } else {
      // SQLite implementation
      const existing = db.exec(
        `SELECT id, status FROM verification_requests WHERE user_id = ? ORDER BY id DESC LIMIT 1`,
        [userId]
      );
      if (existing.length > 0 && existing[0].values.length > 0) {
        const [, status] = existing[0].values[0];
        if (status === 'pending') return res.status(400).json({ error: 'You already have a pending verification request' });
        if (status === 'approved') return res.status(400).json({ error: 'Your account is already verified' });
      }

      const stmt = db.prepare(
        `INSERT INTO verification_requests (user_id, level, document_type, documents, notes, status)
         VALUES (?, ?, ?, ?, ?, 'pending')`
      );
      stmt.bind([userId, level, documentType, JSON.stringify(documents), notes || null]);
      stmt.step();
      stmt.free();

      db.run('UPDATE users SET is_verified = 0, updated_at = datetime("now") WHERE id = ?', [userId]);
      save();

      const result = db.exec(
        `SELECT id, user_id, level, document_type, documents, notes, status, created_at, updated_at
         FROM verification_requests WHERE user_id = ? ORDER BY id DESC LIMIT 1`,
        [userId]
      );
      const row = result[0].values[0];
      const request = {
        id: row[0], userId: row[1], level: row[2], documentType: row[3],
        documents: JSON.parse(row[4]), notes: row[5], status: row[6],
        createdAt: row[7], updatedAt: row[8],
      };
      res.json(request);
    }
  } catch (err) {
    console.error('[/api/verification/submit]', err);
    res.status(500).json({ error: 'Failed to submit verification request' });
  }
});

// Get verification status
router.get('/status', requireAuth, async (req, res) => {
  try {
    const userId = req.userId;
    const db = await getDb();

    if (usePostgres) {
      const resReq = await db.query(
        `SELECT * FROM verification_requests WHERE user_id = $1 ORDER BY id DESC LIMIT 1`,
        [userId]
      );

      if (resReq.rowCount === 0) return res.json({ request: null, status: 'unverified' });

      const request = {
        ...resReq.rows[0],
        documents: typeof resReq.rows[0].documents === 'string' ? JSON.parse(resReq.rows[0].documents) : resReq.rows[0].documents,
        adminNotes: resReq.rows[0].admin_notes ?? undefined,
      };
      res.json({ request, status: request.status });
    } else {
      // SQLite
      const result = db.exec(
        `SELECT id, user_id, level, document_type, documents, notes, status, admin_notes, created_at, updated_at
         FROM verification_requests WHERE user_id = ? ORDER BY id DESC LIMIT 1`,
        [userId]
      );

      if (result.length === 0 || result[0].values.length === 0) {
        return res.json({ request: null, status: 'unverified' });
      }

      const row = result[0].values[0];
      const request = {
        id: row[0], userId: row[1], level: row[2], documentType: row[3],
        documents: JSON.parse(row[4]), notes: row[5], status: row[6],
        adminNotes: row[7], createdAt: row[8], updatedAt: row[9],
      };
      res.json({ request, status: request.status });
    }
  } catch (err) {
    console.error('[/api/verification/status]', err);
    res.status(500).json({ error: 'Failed to get verification status' });
  }
});

module.exports = router;
