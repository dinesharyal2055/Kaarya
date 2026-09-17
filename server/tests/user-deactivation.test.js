/**
 * User deactivation enforcement.
 *
 * Deactivating a user from the admin panel (DELETE /api/admin/users/:id) is a
 * soft delete — it flips is_active to 0. This suite verifies that a deactivated
 * account is actually locked out:
 *   - mobile login rejects deactivated users with 401
 *   - admin login rejects deactivated admins with 401
 *   - existing JWTs are rejected immediately on any authenticated endpoint
 *   - reactivation (PUT isActive) restores access
 *   - active users are unaffected
 *
 * Runs against the local SQLite driver (no DATABASE_URL set in tests).
 */
const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

require('dotenv').config();

jest.mock('sanitize-html', () => (html) => html);

const JWT_SECRET = process.env.JWT_SECRET;
const PASSWORD = 'Kaarya@123';

const ADMIN_ID = 9203;
const VICTIM_ID = 9201;
const DEACT_ADMIN_ID = 9202;

const ADMIN_TOKEN = jwt.sign({ userId: ADMIN_ID }, JWT_SECRET, { expiresIn: '1h' });
const VICTIM_TOKEN = jwt.sign({ userId: VICTIM_ID }, JWT_SECRET, { expiresIn: '1h' });

const authRouter = require('../src/routes/auth');
const adminRouter = require('../src/routes/admin');
const { getDb, save } = require('../src/db');

const app = express();
app.use(express.json());
app.use('/api/auth', authRouter);
app.use('/api/admin', adminRouter);

async function resetFixture() {
  const db = await getDb();
  const hash = bcrypt.hashSync(PASSWORD, 10);

  db.run(`INSERT OR REPLACE INTO users (id, name, email, phone, password_hash, role, is_verified, is_active, is_admin)
          VALUES (?, ?, ?, ?, ?, 'provider', 1, 1, 0)`,
    [VICTIM_ID, 'Victim Provider', 'victim@kaarya.demo', '98009201', hash]);
  db.run(`INSERT OR REPLACE INTO users (id, name, email, phone, password_hash, role, is_verified, is_active, is_admin)
          VALUES (?, ?, ?, ?, ?, 'admin', 1, 0, 1)`,
    [DEACT_ADMIN_ID, 'Deactivated Admin', 'deact-admin@kaarya.demo', '98009202', hash]);
  db.run(`INSERT OR REPLACE INTO users (id, name, email, phone, password_hash, role, is_verified, is_active, is_admin)
          VALUES (?, ?, ?, ?, ?, 'admin', 1, 1, 1)`,
    [ADMIN_ID, 'Super Admin', 'super@kaarya.demo', '98009203', hash]);
  save();
}

function login(body) {
  return request(app).post('/api/auth/login').send(body);
}

function adminLogin(body) {
  return request(app).post('/api/admin/login').send(body);
}

function me(token) {
  return request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);
}

describe('User deactivation enforcement', () => {
  beforeAll(async () => { await getDb(); });

  beforeEach(async () => { await resetFixture(); });

  describe('login', () => {
    it('allows an active user to sign in', async () => {
      const res = await login({ email: 'victim@kaarya.demo', password: PASSWORD });
      expect(res.status).toBe(200);
      expect(res.body.token).toBeTruthy();
    });

    it('rejects a deactivated user with 401 (deactivated message)', async () => {
      await request(app)
        .delete(`/api/admin/users/${VICTIM_ID}`)
        .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
        .expect(200);

      const res = await login({ email: 'victim@kaarya.demo', password: PASSWORD });
      expect(res.status).toBe(401);
      expect(res.body.error).toMatch(/deactivated/i);
    });

    it('rejects a deactivated admin on the admin portal with 401', async () => {
      const res = await adminLogin({ email: 'deact-admin@kaarya.demo', password: PASSWORD });
      expect(res.status).toBe(401);
      expect(res.body.error).toMatch(/deactivated/i);
    });

    it('allows the active super admin on the admin portal', async () => {
      const res = await adminLogin({ email: 'super@kaarya.demo', password: PASSWORD });
      expect(res.status).toBe(200);
      expect(res.body.token).toBeTruthy();
    });
  });

  describe('existing sessions (requireAuth)', () => {
    it('kicks out an already-logged-in user immediately (401 on protected route)', async () => {
      // Valid token works while active
      const before = await me(VICTIM_TOKEN);
      expect(before.status).toBe(200);

      // Admin deactivates the account
      await request(app)
        .delete(`/api/admin/users/${VICTIM_ID}`)
        .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
        .expect(200);

      // Same (unexpired, unrevoked) token is now rejected on any protected route
      const after = await me(VICTIM_TOKEN);
      expect(after.status).toBe(401);
      expect(after.body.error).toMatch(/deactivated/i);
    });

    it('does not block active users', async () => {
      const res = await me(ADMIN_TOKEN);
      expect(res.status).toBe(200);
    });
  });

  describe('reactivation', () => {
    it('restores login and existing session after an admin reactivates the account', async () => {
      await request(app)
        .delete(`/api/admin/users/${VICTIM_ID}`)
        .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
        .expect(200);

      const lockedOut = await me(VICTIM_TOKEN);
      expect(lockedOut.status).toBe(401);

      await request(app)
        .put(`/api/admin/users/${VICTIM_ID}`)
        .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
        .send({ isActive: true })
        .expect(200);

      const backIn = await me(VICTIM_TOKEN);
      expect(backIn.status).toBe(200);

      const loginAgain = await login({ email: 'victim@kaarya.demo', password: PASSWORD });
      expect(loginAgain.status).toBe(200);
    });
  });
});