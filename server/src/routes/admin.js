/**
 * Admin routes — verification request review and user management.
 */
const express = require('express');
const { validate, reviewVerification, updateUserRole } = require('../middleware/validate');
const { requireAuth } = require('../middleware/auth');
const router = express.Router();
const { getDb, save, usePostgres } = require('../db');
const { getClient } = require('../db-pg');

async function requireAdmin(req, res, next) {
  try {
    const db = await getDb();
    if (usePostgres) {
      const resAdmin = await db.query('SELECT is_admin FROM users WHERE id = $1', [req.userId]);
      if (resAdmin.rowCount === 0 || !resAdmin.rows[0].is_admin) return res.status(403).json({ error: 'Forbidden' });
    } else {
      const result = db.exec('SELECT is_admin FROM users WHERE id = ?', [req.userId]);
      if (result.length === 0 || result[0].values.length === 0 || !result[0].values[0][0]) {
        return res.status(403).json({ error: 'Forbidden' });
      }
    }
    next();
  } catch (err) { next(err); }
}

// GET /api/admin/verifications
router.get('/verifications', requireAuth, requireAdmin, async (req, res) => {
  try {
    const db = await getDb();
    if (usePostgres) {
      const res = await db.query(
        `SELECT vr.*, u.name as user_name, u.email as user_email, u.phone as user_phone
         FROM verification_requests vr
         JOIN users u ON vr.user_id = u.id
         ORDER BY vr.created_at DESC LIMIT 50`
      );
      const requests = res.rows.map(r => ({
        id: r.id, userId: r.user_id, level: r.level, documentType: r.document_type,
        documents: typeof r.documents === 'string' ? JSON.parse(r.documents) : r.documents,
        notes: r.notes, status: r.status, adminNotes: r.admin_notes,
        createdAt: r.created_at, updatedAt: r.updated_at,
        user: { name: r.user_name, email: r.user_email, phone: r.user_phone }
      }));
      res.json({ requests });
    } else {
      // SQLite
      const result = db.exec(
        `SELECT vr.id, vr.user_id, vr.level, vr.document_type, vr.documents,
                vr.notes, vr.status, vr.admin_notes, vr.created_at, vr.updated_at,
                u.name, u.email, u.phone
         FROM verification_requests vr
         JOIN users u ON vr.user_id = u.id
         ORDER BY vr.created_at DESC LIMIT 50`
      );
      const requests = (result.length > 0 ? result[0].values : []).map(row => ({
        id: row[0], userId: row[1], level: row[2], documentType: row[3],
        documents: JSON.parse(row[4]), notes: row[5], status: row[6],
        adminNotes: row[7], createdAt: row[8], updatedAt: row[9],
        user: { name: row[10], email: row[11], phone: row[12] }
      }));
      res.json({ requests });
    }
  } catch (err) { res.status(500).json({ error: 'Failed to list verification requests' }); }
});

// POST /api/admin/verifications/:id/review
router.post('/verifications/:id/review', requireAuth, requireAdmin, validate(reviewVerification), async (req, res) => {
  let client;
  try {
    const { id } = req.params;
    const { status, adminNotes } = res.locals.parsedBody;
    const db = await getDb();

    if (usePostgres) {
      client = await getClient();
      await client.query('BEGIN');
      const reqRes = await client.query('SELECT user_id, status FROM verification_requests WHERE id = $1', [id]);
      if (reqRes.rowCount === 0) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Not found' }); }
      if (reqRes.rows[0].status !== 'pending') { await client.query('ROLLBACK'); return res.status(400).json({ error: 'Already reviewed' }); }
      const { user_id: userId } = reqRes.rows[0];

      await client.query('UPDATE verification_requests SET status = $1, admin_notes = $2, updated_at = NOW() WHERE id = $3', [status, adminNotes, id]);
      if (status === 'approved') await client.query('UPDATE users SET is_verified = TRUE, updated_at = NOW() WHERE id = $1', [userId]);

      const noteType = status === 'approved' ? 'verification_approved' : 'verification_rejected';
      const noteTitle = status === 'approved' ? 'Account verified' : 'Verification update';
      const noteBody = status === 'approved' ? 'You are now verified!' : (adminNotes || 'Verification rejected');
      await client.query('INSERT INTO notifications (user_id, type, title, body, data) VALUES ($1, $2, $3, $4, $5)', [userId, noteType, noteTitle, noteBody, '{}']);

      await client.query('COMMIT');
      res.json({ message: `Verification request ${status}`, userId });
    } else {
      // SQLite
      const result = db.exec('SELECT user_id, status FROM verification_requests WHERE id = ?', [id]);
      if (result.length === 0) return res.status(404).json({ error: 'Not found' });
      const [userId, curStatus] = result[0].values[0];
      if (curStatus !== 'pending') return res.status(400).json({ error: 'Already reviewed' });

      db.run('UPDATE verification_requests SET status = ?, admin_notes = ?, updated_at = datetime("now") WHERE id = ?', [status, adminNotes || null, id]);
      if (status === 'approved') db.run('UPDATE users SET is_verified = 1 WHERE id = ?', [userId]);

      const noteType = status === 'approved' ? 'verification_approved' : 'verification_rejected';
      db.run('INSERT INTO notifications (user_id, type, title, body, data) VALUES (?, ?, ?, ?, ?)', [userId, noteType, 'Verification update', adminNotes || 'Done', '{}']);
      save();
      res.json({ message: `Verification request ${status}`, userId });
    }
  } catch (err) {
    if (client) await client.query('ROLLBACK');
    res.status(500).json({ error: 'Failed to review verification' });
  } finally { if (client) client.release(); }
});

module.exports = router;
