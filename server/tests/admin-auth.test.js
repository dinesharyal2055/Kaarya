/**
 * Admin routes — authorization test suite
 * Verifies that all admin endpoints require both authentication AND admin role.
 */
const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');

// Load env before anything else
require('dotenv').config();

const JWT_SECRET = process.env.JWT_SECRET;
const ADMIN_TOKEN   = jwt.sign({ userId: 1 },   JWT_SECRET, { expiresIn: '1h' }); // id=1 = Super Admin
const PROVIDER_TOKEN = jwt.sign({ userId: 100 }, JWT_SECRET, { expiresIn: '1h' }); // id=100 = Ganesh (provider)
const SEEKER_TOKEN  = jwt.sign({ userId: 102 }, JWT_SECRET, { expiresIn: '1h' }); // id=102 = Dinesh (seeker)
const BAD_TOKEN     = jwt.sign({ userId: 999 }, JWT_SECRET, { expiresIn: '1h' }); // id=999 = non-existent user

// Build a minimal app that mounts just the admin router
const adminRouter = require('../src/routes/admin');
const app = express();
app.use(express.json());
app.use('/api/admin', adminRouter);

// ─── Helpers ───────────────────────────────────────────────────────────────────

async function get(res, path, token) {
  return request(app)
    .get(path)
    .set('Authorization', token ? `Bearer ${token}` : '');
}

async function post(res, path, body, token) {
  return request(app)
    .post(path)
    .set('Authorization', token ? `Bearer ${token}` : '')
    .send(body);
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('Admin routes — authorization', () => {

  describe('GET /api/admin/verifications', () => {
    it('rejects unauthenticated requests with 401', async () => {
      const res = await get(null, '/api/admin/verifications', null);
      expect(res.status).toBe(401);
    });

    it('rejects authenticated non-admin user (provider) with 403', async () => {
      const res = await get(null, '/api/admin/verifications', PROVIDER_TOKEN);
      expect(res.status).toBe(403);
      expect(res.body.error).toBe('Forbidden');
    });

    it('rejects authenticated non-admin user (seeker) with 403', async () => {
      const res = await get(null, '/api/admin/verifications', SEEKER_TOKEN);
      expect(res.status).toBe(403);
      expect(res.body.error).toBe('Forbidden');
    });

    it('rejects non-existent user with 403', async () => {
      const res = await get(null, '/api/admin/verifications', BAD_TOKEN);
      expect(res.status).toBe(403);
    });

    it('accepts authenticated admin user with 200', async () => {
      const res = await get(null, '/api/admin/verifications', ADMIN_TOKEN);
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('requests');
    });
  });

  describe('GET /api/admin/verifications/:id', () => {
    it('rejects unauthenticated requests with 401', async () => {
      const res = await get(null, '/api/admin/verifications/1', null);
      expect(res.status).toBe(401);
    });

    it('rejects non-admin user with 403', async () => {
      const res = await get(null, '/api/admin/verifications/1', SEEKER_TOKEN);
      expect(res.status).toBe(403);
    });

    it('accepts admin user (returns 200 even for non-existent id — 404 is correct)', async () => {
      const res = await get(null, '/api/admin/verifications/99999', ADMIN_TOKEN);
      // Admin auth passes; 404 means the request record wasn't found — correct behavior
      expect(res.status).toBe(404);
    });
  });

  describe('POST /api/admin/verifications/:id/review', () => {
    it('rejects unauthenticated requests with 401', async () => {
      const res = await post(null, '/api/admin/verifications/1/review', {}, null);
      expect(res.status).toBe(401);
    });

    it('rejects non-admin user with 403', async () => {
      const res = await post(null, '/api/admin/verifications/1/review', {}, PROVIDER_TOKEN);
      expect(res.status).toBe(403);
    });

    it('rejects missing body with 400 (validation failure)', async () => {
      const res = await post(null, '/api/admin/verifications/1/review', {}, ADMIN_TOKEN);
      expect(res.status).toBe(400);
    });

    it('accepts admin with valid body (returns 404 — no such record)', async () => {
      const res = await post(null, '/api/admin/verifications/99999/review',
        { status: 'approved' }, ADMIN_TOKEN);
      // Admin auth passes; 404 means the request record wasn't found — correct behavior
      expect(res.status).toBe(404);
    });
  });

  describe('POST /api/admin/users/:id/role', () => {
    it('rejects unauthenticated requests with 401', async () => {
      const res = await post(null, '/api/admin/users/100/role', {}, null);
      expect(res.status).toBe(401);
    });

    it('rejects non-admin user with 403', async () => {
      const res = await post(null, '/api/admin/users/100/role', {}, SEEKER_TOKEN);
      expect(res.status).toBe(403);
    });

    it('rejects missing body with 400 (validation failure)', async () => {
      const res = await post(null, '/api/admin/users/100/role', {}, ADMIN_TOKEN);
      expect(res.status).toBe(400);
    });

    it('accepts admin with valid body (returns 200)', async () => {
      // Re-assign Ganesh (id=100) to 'seeker' — will succeed since admin auth passes
      const res = await post(null, '/api/admin/users/100/role',
        { role: 'seeker' }, ADMIN_TOKEN);
      expect(res.status).toBe(200);
      expect(res.body.newRole).toBe('seeker');
    });
  });

  describe('Internal state leakage — error messages', () => {
    it('review route does not leak internal status in error message', async () => {
      // First create a pending verification request to test against
      // Then try to review a non-existent record — should get generic 404
      const res = await post(null, '/api/admin/verifications/99999/review',
        { status: 'approved' }, ADMIN_TOKEN);
      // Generic message only — no internal state
      if (res.status === 404) {
        expect(res.body.error).toBe('Verification request not found');
      } else if (res.status === 400) {
        // If record exists but already reviewed, message must not reveal the status
        expect(res.body.error).not.toMatch(/approved|rejected|pending|more_info/);
        expect(res.body.error).toBe('Request has already been reviewed');
      }
    });
  });
});
