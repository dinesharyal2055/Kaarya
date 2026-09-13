/**
 * Offer submission contract:
 *  - A task owner CANNOT make an offer on their own task (400, even if the
 *    client switches them into provider mode — the backend is authoritative).
 *  - A genuine provider CAN bid, and the seeker's notification must contain
 *    the real provider name (never the string "undefined").
 * Runs against the local SQLite driver (no DATABASE_URL set in tests).
 */
const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');

require('dotenv').config();

// sanitize-html's htmlparser2 dependency is ESM-only and Jest's CJS loader
// cannot require it (latent infra limitation for any test that mounts a router
// using the sanitize middleware). Identity mock is safe — our messages are plain text.
jest.mock('sanitize-html', () => (html) => html);

const JWT_SECRET = process.env.JWT_SECRET;
const OWNER_TOKEN = jwt.sign({ userId: 8001  }, JWT_SECRET, { expiresIn: '1h' });
const OTHER_PROVIDER_TOKEN = jwt.sign({ userId: 8002 }, JWT_SECRET, { expiresIn: '1h' });

const offersRouter = require('../src/routes/offers');
const { getDb, save } = require('../src/db');

const app = express();
app.use(express.json());
app.use('/api/offers', offersRouter);

const JOB_ID = 80001;
const OWNER_ID = 8001;
const PROVIDER_ID = 8002;

async function resetFixture() {
  const db = await getDb();
  db.run('DELETE FROM offers WHERE job_id = ?', [JOB_ID]);
  db.run('DELETE FROM notifications WHERE user_id = ?', [OWNER_ID]);
  db.run('DELETE FROM jobs WHERE id = ?', [JOB_ID]);
  db.run(`INSERT OR REPLACE INTO users (id, name, email, phone, password_hash, role, is_verified, is_active)
          VALUES (?, ?, ?, ?, ?, 'provider', 1, 1)`,
    [OWNER_ID, 'Task Owner', 'owner@kaarya.demo', '98080001', 'test-hash']);
  db.run(`INSERT OR REPLACE INTO users (id, name, email, phone, password_hash, role, is_verified, is_active)
          VALUES (?, ?, ?, ?, ?, 'provider', 1, 1)`,
    [PROVIDER_ID, 'Bidder Provider', 'provider@kaarya.demo', '98080002', 'test-hash']);
  db.run(`INSERT INTO jobs (id, seeker_id, title, description, category, location, budget_min, budget_max, status, urgency)
          VALUES (?, ?, 'Fix leaky pipe', 'Need a plumber', 'plumbing', 'Kathmandu', 5000, 10000, 'open', 'normal')`,
    [JOB_ID, OWNER_ID]);
  save();
}

function makeOfferAs(userId) {
  return request(app)
    .post('/api/offers')
    .set('Authorization', `Bearer ${jwt.sign({ userId }, JWT_SECRET, { expiresIn: '1h' })}`)
    .send({ jobId: String(JOB_ID), price: 6000, message: 'I can fix it today' });
}

beforeAll(async () => {
  await getDb();
  await resetFixture();
});

describe('Offer submission guards', () => {
  test('the task owner cannot make an offer on their own task', async () => {
    const res = await makeOfferAs(OWNER_ID);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('You cannot make an offer on your own task');
  });

  test('a real provider can bid and the seeker notification uses the fixed fallback text', async () => {
    const res = await makeOfferAs(PROVIDER_ID);
    expect(res.status).toBe(201);
    expect(String(res.body.providerId)).toBe(String(PROVIDER_ID));

    const db = await getDb();
    const notifCheck = db.exec('SELECT body FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT 1', [OWNER_ID]);
    expect(notifCheck[0].values.length).toBe(1);
    const body = notifCheck[0].values[0][0];
    expect(body).toContain('A new service provider submitted Rs. 6,000 for "Fix leaky pipe"');
    expect(body).not.toContain('undefined');
    expect(body).not.toContain('null');
  });
});