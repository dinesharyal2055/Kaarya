/**
 * Admin routes — verification request review and user management.
 * All routes require authentication AND admin role.
 */
const express = require('express');
const { validate, reviewVerification, updateUserRole } = require('../middleware/validate');
const { requireAuth } = require('../middleware/auth');
const router = express.Router();
const { getDb, save } = require('../db');

/**
 * Require admin role — must be called after requireAuth.
 * Checks is_admin = 1 on the authenticated user.
 */
async function requireAdmin(req, res, next) {
  try {
    const db = await getDb();
    const result = db.exec(
      'SELECT is_admin FROM users WHERE id = ?',
      [req.userId]
    );
    if (result.length === 0 || result[0].values.length === 0) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const isAdmin = result[0].values[0][0];
    if (!isAdmin) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    next();
  } catch (err) {
    next(err);
  }
}

const VALID_REVIEW_STATUSES = ['approved', 'rejected', 'more_info_needed'];

// GET /api/admin/verifications — list all verification requests
router.get('/verifications', requireAuth, requireAdmin, async (req, res) => {
  try {
    const db = await getDb();
    const result = db.exec(
      `SELECT vr.id, vr.user_id, vr.level, vr.document_type, vr.documents,
              vr.notes, vr.status, vr.admin_notes, vr.created_at, vr.updated_at,
              u.name, u.email, u.phone
       FROM verification_requests vr
       JOIN users u ON vr.user_id = u.id
       ORDER BY vr.created_at DESC
       LIMIT 50`
    );

    const requests = [];
    if (result.length > 0) {
      for (const row of result[0].values) {
        requests.push({
          id: row[0],
          userId: row[1],
          level: row[2],
          documentType: row[3],
          documents: JSON.parse(row[4]),
          notes: row[5],
          status: row[6],
          adminNotes: row[7],
          createdAt: row[8],
          updatedAt: row[9],
          user: {
            name: row[10],
            email: row[11],
            phone: row[12],
          },
        });
      }
    }

    res.json({ requests });
  } catch (err) {
    console.error('[admin/verifications]', err);
    res.status(500).json({ error: 'Failed to list verification requests' });
  }
});

// GET /api/admin/verifications/:id — get single request
router.get('/verifications/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const db = await getDb();

    const result = db.exec(
      `SELECT vr.id, vr.user_id, vr.level, vr.document_type, vr.documents,
              vr.notes, vr.status, vr.admin_notes, vr.created_at, vr.updated_at,
              u.name, u.email, u.phone
       FROM verification_requests vr
       JOIN users u ON vr.user_id = u.id
       WHERE vr.id = ?`,
      [id]
    );

    if (result.length === 0 || result[0].values.length === 0) {
      return res.status(404).json({ error: 'Verification request not found' });
    }

    const row = result[0].values[0];
    res.json({
      id: row[0],
      userId: row[1],
      level: row[2],
      documentType: row[3],
      documents: JSON.parse(row[4]),
      notes: row[5],
      status: row[6],
      adminNotes: row[7],
      createdAt: row[8],
      updatedAt: row[9],
      user: {
        name: row[10],
        email: row[11],
        phone: row[12],
      },
    });
  } catch (err) {
    console.error('[admin/verifications/:id]', err);
    res.status(500).json({ error: 'Failed to get verification request' });
  }
});

// POST /api/admin/verifications/:id/review — approve or reject a request
router.post('/verifications/:id/review', requireAuth, requireAdmin, validate(reviewVerification), async (req, res) => {
  try {
    const { id } = req.params;
    const { status, adminNotes } = res.locals.parsedBody;

    const db = await getDb();

    // Find the request
    const reqResult = db.exec(
      'SELECT id, user_id, status FROM verification_requests WHERE id = ?',
      [id]
    );
    if (reqResult.length === 0 || reqResult[0].values.length === 0) {
      return res.status(404).json({ error: 'Verification request not found' });
    }

    const [reqId, userId, currentStatus] = reqResult[0].values[0];
    if (currentStatus !== 'pending') {
      return res.status(400).json({ error: 'Request has already been reviewed' });
    }

    // Update the request
    db.run(
      'UPDATE verification_requests SET status = ?, admin_notes = ?, updated_at = datetime("now") WHERE id = ?',
      [status, adminNotes || null, id]
    );

    // Update user's is_verified flag
    if (status === 'approved') {
      db.run('UPDATE users SET is_verified = 1, updated_at = datetime("now") WHERE id = ?', [userId]);
      // Notify user: account verified
      db.run(
        `INSERT INTO notifications (user_id, type, title, body, data) VALUES (?, ?, ?, ?, ?)`,
        [userId, 'verification_approved', 'Account verified',
          'Your account has been verified. You can now start accepting jobs!', '{}']
      );
    } else if (status === 'rejected') {
      // Notify user: verification rejected
      db.run(
        `INSERT INTO notifications (user_id, type, title, body, data) VALUES (?, ?, ?, ?, ?)`,
        [userId, 'verification_rejected', 'Verification update',
          adminNotes || 'Your verification documents were not approved. Please submit again.', '{}']
      );
    }

    save();

    res.json({
      message: `Verification request ${status}`,
      requestId: reqId,
      userId,
    });
  } catch (err) {
    console.error('[admin/verifications/:id/review]', err);
    res.status(500).json({ error: 'Failed to review verification request' });
  }
});

// POST /api/admin/users/:id/role — update a user's role
router.post('/users/:id/role', requireAuth, requireAdmin, validate(updateUserRole), async (req, res) => {
  try {
    const { id } = req.params;
    const { role } = res.locals.parsedBody;

    const db = await getDb();
    const result = db.exec('SELECT id, name, role FROM users WHERE id = ?', [id]);

    if (result.length === 0 || result[0].values.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const [userId, name, oldRole] = result[0].values[0];
    db.run('UPDATE users SET role = ?, updated_at = datetime("now") WHERE id = ?', [role, id]);
    save();

    res.json({ message: `Role updated for ${name}`, userId, oldRole, newRole: role });
  } catch (err) {
    console.error('[admin/users/:id/role]', err);
    res.status(500).json({ error: 'Failed to update user role' });
  }
});

module.exports = router;
