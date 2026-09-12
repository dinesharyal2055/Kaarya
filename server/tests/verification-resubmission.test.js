/**
 * Verification resubmission flow
 * User is rejected with a reason → can resubmit → new request becomes pending →
 * admin approves → user is verified. Proves the mobile consumer contract too:
 * the status endpoint always exposes adminNotes (the rejection reason).
 * Runs against the local SQLite driver (no DATABASE_URL set in tests).
 */
const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');

require('dotenv').config();

const JWT_SECRET = process.env.JWT_SECRET;
const ADMIN_TOKEN = jwt.sign({ userId: 1 }, JWT_SECRET, { expiresIn: '1h' }); // id=1 = Super Admin
const TEST_USER_ID = 610;
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
  documents: ['/uploads/verification/resubmit-1.jpg'],
  notes: 'Resubmission test'
};

const REJECTION_NOTE = 'Document photos are too dark. Please retake with better lighting.';

async function resetTestUser() {
  const db = await getDb();
  db.run('DELETE FROM verification_requests WHERE user_id = ?', [TEST_USER_ID]);
  db.run(`DELETE FROM notifications WHERE user_id = ? AND type IN ('verification_approved', 'verification_rejected')`, [TEST_USER_ID]);
  db.run(`INSERT OR IGNORE INTO users (id, name, email, phone, password_hash, role, is_verified, is_active)
          VALUES (?, ?, ?, ?, ?, 'provider', 0, 1)`,
    [TEST_USER_ID, 'Resubmit Test User', 'resubmit@kaarya.demo', '9806100001', 'test-hash']);
  db.run('UPDATE users SET is_verified = 0 WHERE id = ?', [TEST_USER_ID]);
  save();
}

async function submit() {
  return request(app)
    .post('/api/verification/submit')
    .set('Authorization', `Bearer ${TEST_USER_TOKEN}`)
    .send(SUBMIT_BODY);
}

async function review(requestId, body) {
  return request(app)
    .post(`/api/admin/verifications/${requestId}/review`)
    .set('Authorization', `Bearer ${ADMIN_TOKEN}`)
    .send(body);
}

beforeAll(async () => {
  await getDb();
  await resetTestUser();
});

describe('Verification resubmission flow', () => {
  test('a rejected request exposes the reason and the user can resubmit into pending', async () => {
    const db = await getDb();

    // 1. First submission
    const first = await submit();
    expect(first.status).toBe(200);
    const firstId = first.body.id;
    expect(first.body.status).toBe('pending');

    // 2. Admin rejects WITH a reason
    const rejectRes = await review(firstId, { status: 'rejected', adminNotes: REJECTION_NOTE });
    expect(rejectRes.status).toBe(200);

    // 3. Mobile-facing status exposes the rejection reason (adminNotes contract)
    const statusAfterReject = await request(app)
      .get('/api/verification/status')
      .set('Authorization', `Bearer ${TEST_USER_TOKEN}`);
    expect(statusAfterReject.status).toBe(200);
    expect(statusAfterReject.body.status).toBe('rejected');
    expect(statusAfterReject.body.request.adminNotes).toBe(REJECTION_NOTE);

    // 4. Resubmit → new pending request, old history preserved
    const second = await submit();
    expect(second.status).toBe(200);
    const secondId = second.body.id;
    expect(secondId).not.toBe(firstId);
    expect(second.body.status).toBe('pending');

    const history = db.exec(
      'SELECT id, status FROM verification_requests WHERE user_id = ? ORDER BY id ASC',
      [TEST_USER_ID]
    );
    expect(history[0].values.length).toBe(2); // rejected + pending rows both kept
    expect(history[0].values[0][1]).toBe('rejected');
    expect(history[0].values[1][1]).toBe('pending');

    // 5. Status now reflects the latest (pending) request
    const statusAfterResubmit = await request(app)
      .get('/api/verification/status')
      .set('Authorization', `Bearer ${TEST_USER_TOKEN}`);
    expect(statusAfterResubmit.body.status).toBe('pending');
    expect(String(statusAfterResubmit.body.request.id)).toBe(String(secondId));

    // 6. Guard: cannot submit again while a resubmission is pending
    const third = await submit();
    expect(third.status).toBe(400);
  });

  test('approval after resubmission verifies the user and preserves the rejected request', async () => {
    const db = await getDb();
    await resetTestUser();

    const first = await submit();
    const firstId = first.body.id;
    await review(firstId, { status: 'rejected', adminNotes: REJECTION_NOTE });

    const second = await submit();
    const secondId = second.body.id;

    // Admin sees BOTH requests (history + new pending); old one is still rejected
    const listRes = await request(app)
      .get('/api/admin/verifications')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`);
    expect(listRes.status).toBe(200);
    const foundFirst = listRes.body.requests.find(r => String(r.id) === String(firstId));
    const foundSecond = listRes.body.requests.find(r => String(r.id) === String(secondId));
    expect(foundFirst).toBeDefined();
    expect(foundFirst.status).toBe('rejected');
    expect(foundFirst.adminNotes).toBe(REJECTION_NOTE);
    expect(foundSecond).toBeDefined();
    expect(foundSecond.status).toBe('pending');

    // Approve the resubmission
    const approveRes = await review(secondId, { status: 'approved', adminNotes: 'Approved on resubmission' });
    expect(approveRes.status).toBe(200);

    // Backend state: new request approved, old request untouched, user verified
    const secondCheck = db.exec('SELECT status FROM verification_requests WHERE id = ?', [secondId]);
    expect(secondCheck[0].values[0][0]).toBe('approved');
    const firstCheck = db.exec('SELECT status FROM verification_requests WHERE id = ?', [firstId]);
    expect(firstCheck[0].values[0][0]).toBe('rejected');
    const userCheck = db.exec('SELECT is_verified FROM users WHERE id = ?', [TEST_USER_ID]);
    expect(userCheck[0].values[0][0]).toBe(1);

    // Mobile status reflects verified
    const statusRes = await request(app)
      .get('/api/verification/status')
      .set('Authorization', `Bearer ${TEST_USER_TOKEN}`);
    expect(statusRes.body.status).toBe('approved');

    // Guard: cannot submit again once verified
    const blocked = await submit();
    expect(blocked.status).toBe(400);
  });
});