/**
 * Demo/test account mechanism — gating and behaviour
 * The /api/dev/demo endpoints must:
 *   - be unreachable unless DEMO_MODE=true is explicitly set,
 *   - be unreachable in production (NODE_ENV=production) even with DEMO_MODE=true,
 *   - bootstrap a reusable seeker account (idempotent) and return a working token,
 *   - reset the demo user to unverified + clear verification history on demand.
 */
const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');

require('dotenv').config();

const JWT_SECRET = process.env.JWT_SECRET;

const demoRouter = require('../src/routes/demo').router;
const verificationRouter = require('../src/routes/verification');
const adminRouter = require('../src/routes/admin');
const { getDb, save } = require('../src/db');

const app = express();
app.use(express.json());
app.use('/api/dev', demoRouter);
app.use('/api/verification', verificationRouter);
app.use('/api/admin', adminRouter);

const ORIGINAL_DEMO_MODE = process.env.DEMO_MODE;
const ORIGINAL_NODE_ENV = process.env.NODE_ENV;

function deleteDemoEnv() {
  delete process.env.DEMO_MODE;
  delete process.env.NODE_ENV;
}

async function bootstrap() {
  return request(app).post('/api/dev/demo/bootstrap');
}

async function resetDemo() {
  return request(app).post('/api/dev/demo/reset');
}

async function demoStatus(token) {
  return request(app)
    .get('/api/verification/status')
    .set('Authorization', `Bearer ${token}`);
}

beforeAll(async () => {
  await getDb();
  deleteDemoEnv();
});

afterAll(() => {
  if (ORIGINAL_DEMO_MODE === undefined) delete process.env.DEMO_MODE;
  else process.env.DEMO_MODE = ORIGINAL_DEMO_MODE;
  if (ORIGINAL_NODE_ENV === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = ORIGINAL_NODE_ENV;
});

describe('Demo/test account mechanism', () => {
  test('is disabled by default (no DEMO_MODE)', async () => {
    deleteDemoEnv();
    expect(process.env.DEMO_MODE).toBeUndefined();
    const res = await bootstrap();
    expect(res.status).toBe(404);
    expect(res.body.demo).toBeUndefined();
  });

  test('cannot be enabled in production even when DEMO_MODE=true', async () => {
    process.env.DEMO_MODE = 'true';
    process.env.NODE_ENV = 'production';
    const res = await bootstrap();
    expect(res.status).toBe(404);

    const resetRes = await resetDemo();
    expect(resetRes.status).toBe(404);
    deleteDemoEnv();
  });

  test('bootstrap works when explicitly enabled and returns usable credentials + token', async () => {
    process.env.DEMO_MODE = 'true';
    delete process.env.NODE_ENV; // dev

    const res = await bootstrap();
    expect(res.status).toBe(200);
    expect(res.body.demo).toBe(true);
    expect(res.body.credentials).toBeDefined();
    expect(res.body.credentials.email).toContain('@');
    expect(res.body.credentials.password).toBeTruthy();
    expect(res.body.token).toBeTruthy();
    expect(res.body.user.role).toBe('seeker');

    // The returned bearer token is a real, usable session token
    const statusRes = await demoStatus(res.body.token);
    expect(statusRes.status).toBe(200);

    // Idempotent: bootstrapping again returns the SAME account
    const again = await bootstrap();
    expect(again.status).toBe(200);
    expect(again.body.user.id).toBe(res.body.user.id);

    deleteDemoEnv();
  });

  test('reset wipes the demo user verification history and clears verified flag', async () => {
    process.env.DEMO_MODE = 'true';
    delete process.env.NODE_ENV;

    const db = await getDb();
    const boot = await bootstrap();
    const demoUserId = Number(boot.body.user.id);
    const demoToken = boot.body.token;
    expect(demoUserId).toBeGreaterThan(0);

    // Seed one rejected request so the reset has something to clear
    const submitRes = await request(app)
      .post('/api/verification/submit')
      .set('Authorization', `Bearer ${demoToken}`)
      .send({ level: 3, documentType: 'citizenship', documents: ['/uploads/verification/demo.jpg'], notes: 'demo' });
    expect(submitRes.status).toBe(200);
    const requestId = submitRes.body.id;

    const adminToken = jwt.sign({ userId: 1 }, JWT_SECRET, { expiresIn: '1h' });
    await request(app)
      .post(`/api/admin/verifications/${requestId}/review`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'rejected', adminNotes: 'demo reject' });

    const beforeRes = await demoStatus(demoToken);
    expect(beforeRes.body.status).toBe('rejected');

    // Reset
    const resetRes = await resetDemo();
    expect(resetRes.status).toBe(200);
    expect(resetRes.body.user.isVerified).toBe(false);

    const requestsLeft = db.exec('SELECT COUNT(*) as cnt FROM verification_requests WHERE user_id = ?', [demoUserId]);
    expect(requestsLeft[0].values[0][0]).toBe(0);

    const afterRes = await demoStatus(demoToken);
    expect(afterRes.body.status).toBe('unverified');

    deleteDemoEnv();
  });
});