/**
 * Admin verification — end-to-end state propagation test
 * Proves the production trace the Super Admin relies on:
 *   user submits request → admin approves → is_verified flips in DB →
 *   mobile /api/verification/status reflects it → notification created.
 *
 * Also covers rejection (must NOT verify) and admin direct overrides.
 * Runs against the local SQLite driver (no DATABASE_URL set in tests).
 */
const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');

require('dotenv').config();

const JWT_SECRET = process.env.JWT_SECRET;
const ADMIN_TOKEN = jwt.sign({ userId: 1 }, JWT_SECRET, { expiresIn: '1h' }); // id=1 = Super Admin
const TEST_USER_ID = 500;
const TEST_USER_TOKEN = jwt.sign({ userId: TEST_USER_ID }, JWT_SECRET, { expiresIn: '1h' });

const adminRouter = require('../src/routes/admin');
const verificationRouter = require('../src/routes/verification');
const { getDb, save } = require('../src/db');

const app = express();
app.use(express.json());
app.use('/api/admin', adminRouter);
app.use('/api/verification', verificationRouter);

const SUBMIT_BODY = {
  level: 3,
  documentType: 'citizenship',
  documents: ['/uploads/verification/e2e.jpg'],
  notes: 'E2E test submission'
};

async function resetTestUser() {
  const db = await getDb();
  db.run('DELETE FROM verification_requests WHERE user_id = ?', [TEST_USER_ID]);
  db.run("DELETE FROM notifications WHERE user_id = ? AND type IN ('verification_approved', 'verification_rejected')", [TEST_USER_ID]);
  db.run(`INSERT OR IGNORE INTO users (id, name, email, phone, password_hash, role, is_verified, is_active)
          VALUES (?, ?, ?, ?, ?, 'provider', 0, 1)`,
    [TEST_USER_ID, 'E2E Test Provider', 'e2e-provider@kaarya.demo', '9805000001', 'test-hash']);
  db.run('UPDATE users SET is_verified = 0 WHERE id = ?', [TEST_USER_ID]);
  save();
}

beforeAll(async () => {
  await getDb(); // ensure schema + demo seeds exist
  await resetTestUser();
});

describe('Admin verification — production trace', () => {
  test('approval propagates: request → is_verified → mobile status → notification', async () => {
    const db = await getDb();

    // 1. User submits a verification request via the mobile endpoint
    const submitRes = await request(app)
      .post('/api/verification/submit')
      .set('Authorization', `Bearer ${TEST_USER_TOKEN}`)
      .send(SUBMIT_BODY);
    expect(submitRes.status).toBe(200);
    const requestId = submitRes.body.id;
    expect(requestId).toBeDefined();
    expect(submitRes.body.status).toBe('pending');

    // 2. Admin sees the request in the list AND user detail shows pending + request id
    const listRes = await request(app)
      .get('/api/admin/verifications')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`);
    expect(listRes.status).toBe(200);
    const found = listRes.body.requests.find(r => String(r.id) === String(requestId));
    expect(found).toBeDefined();
    expect(found.userName).toBe('E2E Test Provider');

    const beforeRes = await request(app)
      .get(`/api/admin/users/${TEST_USER_ID}`)
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`);
    expect(beforeRes.status).toBe(200);
    expect(beforeRes.body.verificationStatus).toBe('pending');
    expect(String(beforeRes.body.verificationRequest.id)).toBe(String(requestId));

    // 3. Admin approves
    const reviewRes = await request(app)
      .post(`/api/admin/verifications/${requestId}/review`)
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
      .send({ status: 'approved', adminNotes: 'E2E approved' });
    expect(reviewRes.status).toBe(200);

    // 4. Backend state actually changed
    const reqCheck = db.exec('SELECT status FROM verification_requests WHERE id = ?', [requestId]);
    expect(reqCheck[0].values[0][0]).toBe('approved');
    const userCheck = db.exec('SELECT is_verified FROM users WHERE id = ?', [TEST_USER_ID]);
    expect(userCheck[0].values[0][0]).toBe(1);

    // 5. Mobile-facing status reflects the approval (business logic reads this)
    const statusRes = await request(app)
      .get('/api/verification/status')
      .set('Authorization', `Bearer ${TEST_USER_TOKEN}`);
    expect(statusRes.status).toBe(200);
    expect(statusRes.body.status).toBe('approved');

    // 6. Admin user detail reflects verified
    const detailRes = await request(app)
      .get(`/api/admin/users/${TEST_USER_ID}`)
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`);
    expect(detailRes.body.isVerified).toBe(true);
    expect(detailRes.body.verificationStatus).toBe('verified');

    // 7. Notification created
    const notifCheck = db.exec(
      "SELECT type FROM notifications WHERE user_id = ? AND type = 'verification_approved'",
      [TEST_USER_ID]
    );
    expect(notifCheck[0].values.length).toBeGreaterThan(0);
  });

  test('rejection does NOT verify the user', async () => {
    const db = await getDb();
    await resetTestUser(); // ensure no leftover request from the approval test

    const submitRes = await request(app)
      .post('/api/verification/submit')
      .set('Authorization', `Bearer ${TEST_USER_TOKEN}`)
      .send(SUBMIT_BODY);
    expect(submitRes.status).toBe(200);
    const requestId = submitRes.body.id;

    const reviewRes = await request(app)
      .post(`/api/admin/verifications/${requestId}/review`)
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
      .send({ status: 'rejected', adminNotes: 'Documents unclear' });
    expect(reviewRes.status).toBe(200);

    const userCheck = db.exec('SELECT is_verified FROM users WHERE id = ?', [TEST_USER_ID]);
    expect(userCheck[0].values[0][0]).toBe(0);

    const statusRes = await request(app)
      .get('/api/verification/status')
      .set('Authorization', `Bearer ${TEST_USER_TOKEN}`);
    expect(statusRes.body.status).toBe('rejected');

    const detailRes = await request(app)
      .get(`/api/admin/users/${TEST_USER_ID}`)
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`);
    expect(detailRes.body.isVerified).toBe(false);
    expect(detailRes.body.verificationStatus).toBe('rejected');
  });

  test('a request can only be reviewed once', async () => {
    await resetTestUser(); // ensure no leftover request

    const submitRes = await request(app)
      .post('/api/verification/submit')
      .set('Authorization', `Bearer ${TEST_USER_TOKEN}`)
      .send(SUBMIT_BODY);
    const requestId = submitRes.body.id;

    const first = await request(app)
      .post(`/api/admin/verifications/${requestId}/review`)
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
      .send({ status: 'approved' });
    expect(first.status).toBe(200);

    const second = await request(app)
      .post(`/api/admin/verifications/${requestId}/review`)
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
      .send({ status: 'rejected' });
    expect(second.status).toBe(400);
  });

  test('admin can verify/unverify directly via PUT when no request exists', async () => {
    const db = await getDb();
    await resetTestUser(); // ensure user 500 has no pending request and is unverified

    const verifyRes = await request(app)
      .put(`/api/admin/users/${TEST_USER_ID}`)
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
      .send({ isVerified: true });
    expect(verifyRes.status).toBe(200);
    expect(verifyRes.body.isVerified).toBe(true);
    expect(verifyRes.body.verificationStatus).toBe('verified');

    const unverifyRes = await request(app)
      .put(`/api/admin/users/${TEST_USER_ID}`)
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
      .send({ isVerified: false });
    expect(unverifyRes.status).toBe(200);
    expect(unverifyRes.body.isVerified).toBe(false);
    expect(unverifyRes.body.verificationStatus).toBe('unverified');

    const userCheck = db.exec('SELECT is_verified FROM users WHERE id = ?', [TEST_USER_ID]);
    expect(userCheck[0].values[0][0]).toBe(0);
  });
});