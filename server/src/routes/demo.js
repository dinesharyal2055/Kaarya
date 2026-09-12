/**
 * Dev/test demo account router (STRICTLY non-production).
 *
 * Mounted at /api/dev but every request is gated by isDemoEnabled():
 *   DEMO_MODE === 'true'  AND  NODE_ENV !== 'production'
 *
 * Both conditions are required, so the endpoints can never activate in a
 * production deployment (NODE_ENV=production always blocks them, even if
 * DEMO_MODE=true is set by mistake).
 *
 * Purpose: give QA/testers a disposable seeker account they can use through
 * the normal mobile login screen (email + password — no OTP) to repeatedly
 * exercise the unverified -> submit -> reject -> resubmit -> approve journey.
 * demo/reset wipes the demo user's verification requests and clears their
 * verified flag so the full cycle can be re-run from scratch.
 */

const express = require('express');
const { getDb, save, usePostgres } = require('../db');
const { signToken, hashPassword } = require('../middleware/auth');

const DEMO_NAME = 'Kaarya Demo User';
const DEMO_EMAIL = process.env.DEMO_EMAIL || 'demo@kaarya.dev';
const DEMO_PHONE = process.env.DEMO_PHONE || '9809000000';
const DEMO_PASSWORD = process.env.DEMO_PASSWORD || 'KaaryaDemo@123';
const DEMO_ROLE = 'seeker';

function isDemoEnabled() {
  return process.env.DEMO_MODE === 'true' && process.env.NODE_ENV !== 'production';
}

async function findOrCreateDemoUser(db) {
  let userId;

  if (usePostgres) {
    const existing = await db.query('SELECT id FROM users WHERE phone = $1', [DEMO_PHONE]);
    if (existing.rowCount > 0) {
      return existing.rows[0].id;
    }
    const passwordHash = await hashPassword(DEMO_PASSWORD);
    const ins = await db.query(
      `INSERT INTO users (name, email, phone, password_hash, role, is_active, is_verified)
       VALUES ($1, $2, $3, $4, $5, TRUE, FALSE) RETURNING id`,
      [DEMO_NAME, DEMO_EMAIL, DEMO_PHONE, passwordHash, DEMO_ROLE]
    );
    userId = ins.rows[0].id;
  } else {
    const existing = db.exec('SELECT id FROM users WHERE phone = ?', [DEMO_PHONE]);
    if (existing.length > 0 && existing[0].values.length > 0) {
      return existing[0].values[0][0];
    }
    const passwordHash = await hashPassword(DEMO_PASSWORD);
    db.run(
      `INSERT INTO users (name, email, phone, password_hash, role, is_active, is_verified)
       VALUES (?, ?, ?, ?, ?, 1, 0)`,
      [DEMO_NAME, DEMO_EMAIL, DEMO_PHONE, passwordHash, DEMO_ROLE]
    );
    userId = db.exec('SELECT last_insert_rowid() as id')[0].values[0][0];
    save();
  }

  return userId;
}

async function buildDemoPayload(db, userId) {
  let isVerified = false;
  if (usePostgres) {
    const u = await db.query('SELECT is_verified FROM users WHERE id = $1', [userId]);
    isVerified = u.rowCount > 0 && u.rows[0].is_verified === true;
  } else {
    const u = db.exec('SELECT is_verified FROM users WHERE id = ?', [userId]);
    isVerified = u.length > 0 && u[0].values[0][0] === 1;
  }

  return {
    demo: true,
    user: {
      id: String(userId),
      name: DEMO_NAME,
      email: DEMO_EMAIL,
      phone: DEMO_PHONE,
      role: DEMO_ROLE,
      isVerified,
    },
    credentials: { email: DEMO_EMAIL, password: DEMO_PASSWORD },
    token: signToken(userId),
  };
}

const router = express.Router();

// Hard gate: no route below ever runs unless demo mode is explicitly enabled.
router.use((req, res, next) => {
  if (!isDemoEnabled()) {
    return res.status(404).json({ error: 'Not found' });
  }
  next();
});

// POST /api/dev/demo/bootstrap
// Idempotently create (or reuse) the demo seeker account and return sign-in
// credentials plus a bearer token for direct API testing.
router.post('/demo/bootstrap', async (req, res) => {
  try {
    const db = await getDb();
    const userId = await findOrCreateDemoUser(db);
    res.json(await buildDemoPayload(db, userId));
  } catch (err) {
    console.error('[/api/dev/demo/bootstrap] Error:', err);
    res.status(500).json({ error: 'Failed to bootstrap demo account' });
  }
});

// POST /api/dev/demo/reset
// Reset the demo user so the verification lifecycle can be exercised again:
// deletes their verification requests and clears the verified flag.
router.post('/demo/reset', async (req, res) => {
  try {
    const db = await getDb();
    const userId = await findOrCreateDemoUser(db);

    if (usePostgres) {
      await db.query('DELETE FROM verification_requests WHERE user_id = $1', [userId]);
      await db.query('UPDATE users SET is_verified = FALSE, updated_at = NOW() WHERE id = $1', [userId]);
    } else {
      db.run('DELETE FROM verification_requests WHERE user_id = ?', [userId]);
      db.run('UPDATE users SET is_verified = 0, updated_at = datetime("now") WHERE id = ?', [userId]);
      save();
    }

    res.json(await buildDemoPayload(db, userId));
  } catch (err) {
    console.error('[/api/dev/demo/reset] Error:', err);
    res.status(500).json({ error: 'Failed to reset demo account' });
  }
});

module.exports = { router, isDemoEnabled };