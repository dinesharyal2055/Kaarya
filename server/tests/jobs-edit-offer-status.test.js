/**
 * Task editing guard driven by offer status:
 *  - A job with a pending offer cannot be edited (400 BID_EXISTS).
 *  - Once that offer is rejected, the task poster can edit again (200).
 *  - An accepted offer (job now assigned) still blocks editing (400 BID_EXISTS).
 * Runs against the local SQLite driver (no DATABASE_URL set in tests).
 */
const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');

require('dotenv').config();

jest.mock('sanitize-html', () => (html) => html);

const JWT_SECRET = process.env.JWT_SECRET;
const OWNER_TOKEN = jwt.sign({ userId: 9001 }, JWT_SECRET, { expiresIn: '1h' });
const PROVIDER_TOKEN = jwt.sign({ userId: 9002 }, JWT_SECRET, { expiresIn: '1h' });

const jobsRouter = require('../src/routes/jobs');
const offersRouter = require('../src/routes/offers');
const { getDb, save } = require('../src/db');

const app = express();
app.use(express.json());
app.use('/api/jobs', jobsRouter);
app.use('/api/offers', offersRouter);

const JOB_ID = 90001;
const OWNER_ID = 9001;
const PROVIDER_ID = 9002;

async function resetFixture() {
  const db = await getDb();
  db.run('DELETE FROM offers WHERE job_id = ?', [JOB_ID]);
  db.run('DELETE FROM jobs WHERE id = ?', [JOB_ID]);
  db.run(`INSERT OR REPLACE INTO users (id, name, email, phone, password_hash, role, is_verified, is_active)
          VALUES (?, ?, ?, ?, ?, 'seeker', 1, 1)`,
    [OWNER_ID, 'Task Poster', 'poster@kaarya.demo', '98090001', 'test-hash']);
  db.run(`INSERT OR REPLACE INTO users (id, name, email, phone, password_hash, role, is_verified, is_active)
          VALUES (?, ?, ?, ?, ?, 'provider', 1, 1)`,
    [PROVIDER_ID, 'Bidder Provider', 'bidder@kaarya.demo', '98090002', 'test-hash']);
  db.run(`INSERT INTO jobs (id, seeker_id, title, description, category, location, budget_min, budget_max, status, urgency)
          VALUES (?, ?, 'Repair balcony', 'Need masonry work', 'maintenance', 'Tokha', 3000, 5000, 'open', 'normal')`,
    [JOB_ID, OWNER_ID]);
  save();
}

function makeOffer() {
  return request(app)
    .post('/api/offers')
    .set('Authorization', `Bearer ${PROVIDER_TOKEN}`)
    .send({ jobId: String(JOB_ID), price: 4000, message: 'I can do it' });
}

function editJobAsOwner() {
  return request(app)
    .patch(`/api/jobs/${JOB_ID}`)
    .set('Authorization', `Bearer ${OWNER_TOKEN}`)
    .send({ title: 'Repair balcony railing' });
}

function rejectOfferAsOwner(offerId) {
  return request(app)
    .post(`/api/offers/${offerId}/reject`)
    .set('Authorization', `Bearer ${OWNER_TOKEN}`);
}

async function offerIdFor(jobId, providerId) {
  const db = await getDb();
  const res = db.exec('SELECT id FROM offers WHERE job_id = ? AND provider_id = ? ORDER BY id DESC LIMIT 1', [jobId, providerId]);
  return res[0].values[0][0];
}

beforeAll(async () => { await getDb(); });

describe('Job edit guard driven by active offers', () => {
  beforeEach(async () => { await resetFixture(); });

  test('no offers -> task poster can edit', async () => {
    const res = await editJobAsOwner();
    expect(res.status).toBe(200);
  });

  test('pending offer -> editing is blocked with BID_EXISTS', async () => {
    const offerRes = await makeOffer();
    expect(offerRes.status).toBe(201);

    const res = await editJobAsOwner();
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('BID_EXISTS');
  });

  test('rejected offer -> task poster can edit again', async () => {
    await makeOffer();
    const offerId = await offerIdFor(JOB_ID, PROVIDER_ID);

    const rejectRes = await rejectOfferAsOwner(offerId);
    expect(rejectRes.status).toBe(200);

    const res = await editJobAsOwner();
    expect(res.status).toBe(200);
  });

  test('accepted offer (job assigned) -> editing remains blocked', async () => {
    await makeOffer();
    const offerId = await offerIdFor(JOB_ID, PROVIDER_ID);
    const db = await getDb();
    db.run("UPDATE offers SET status = 'accepted' WHERE id = ?", [offerId]);
    db.run("UPDATE jobs SET status = 'assigned' WHERE id = ?", [JOB_ID]);
    save();

    const res = await editJobAsOwner();
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('BID_EXISTS');
  });
});