/**
 * Reviews reviewee guard — a reviewer may only rate the other participant
 * of the completed job:
 *   - seeker can only review the accepted provider
 *   - accepted provider can only review the job seeker
 *   - reviewing an unrelated user is rejected
 * Runs against the local SQLite driver (no DATABASE_URL set in tests).
 */
const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');

require('dotenv').config();

jest.mock('sanitize-html', () => (html) => html);

const JWT_SECRET = process.env.JWT_SECRET;
const SEEKER_TOKEN = jwt.sign({ userId: 12001 }, JWT_SECRET, { expiresIn: '1h' });
const PROVIDER_TOKEN = jwt.sign({ userId: 12002 }, JWT_SECRET, { expiresIn: '1h' });

const reviewsRouter = require('../src/routes/reviews');
const { getDb, save } = require('../src/db');

const app = express();
app.use(express.json());
app.use('/api/reviews', reviewsRouter);

const SEEKER_ID = 12001;
const PROVIDER_ID = 12002;
const UNRELATED_ID = 12003;
const JOB_ID = 125002;

async function resetFixture() {
  const db = await getDb();
  db.run('DELETE FROM reviews WHERE job_id = ?', [JOB_ID]);
  db.run('DELETE FROM offers WHERE job_id = ?', [JOB_ID]);
  db.run('DELETE FROM notifications WHERE data LIKE ?', [`%${JOB_ID}%`]);
  db.run('DELETE FROM jobs WHERE id = ?', [JOB_ID]);
  db.run(`INSERT OR REPLACE INTO users (id, name, email, phone, password_hash, role, is_verified, is_active)
          VALUES (?, ?, ?, ?, ?, 'seeker', 1, 1)`,
    [SEEKER_ID, 'Guard Seeker', 'guard-seeker@kaarya.demo', '98120021', 'test-hash']);
  db.run(`INSERT OR REPLACE INTO users (id, name, email, phone, password_hash, role, is_verified, is_active)
          VALUES (?, ?, ?, ?, ?, 'provider', 1, 1)`,
    [PROVIDER_ID, 'Guard Provider', 'guard-provider@kaarya.demo', '98120022', 'test-hash']);
  db.run(`INSERT OR REPLACE INTO users (id, name, email, phone, password_hash, role, is_verified, is_active)
          VALUES (?, ?, ?, ?, ?, 'provider', 1, 1)`,
    [UNRELATED_ID, 'Unrelated Provider', 'guard-unrelated@kaarya.demo', '98120023', 'test-hash']);
  db.run(`INSERT INTO jobs (id, seeker_id, title, description, category, location, budget_min, budget_max, status, urgency)
          VALUES (?, ?, 'Fix leaky pipe', 'Kitchen pipe leaking', 'plumbing', 'Baneshwor', 2000, 4000, 'completed', 'normal')`,
    [JOB_ID, SEEKER_ID]);
  db.run(`INSERT INTO offers (job_id, provider_id, amount, message, status)
          VALUES (?, ?, 2500, 'I can fix it', 'accepted')`,
    [JOB_ID, PROVIDER_ID]);
  save();
}

function submitReviewAs(token, revieweeId, rate) {
  return request(app)
    .post('/api/reviews')
    .set('Authorization', `Bearer ${token}`)
    .send({ jobId: String(JOB_ID), revieweeId: String(revieweeId), rating: rate, comment: 'Review body' });
}

function getReviewsForJob() {
  return request(app).get(`/api/reviews/job/${JOB_ID}`);
}

beforeEach(resetFixture);

describe('POST /api/reviews reviewee guard', () => {
  test('seeker can review the accepted provider', async () => {
    const submit = await submitReviewAs(SEEKER_TOKEN, PROVIDER_ID, 5);
    expect(submit.status).toBe(201);

    const res = await getReviewsForJob();
    expect(res.body.reviews).toHaveLength(1);
    expect(String(res.body.reviews[0].reviewerId)).toBe(String(SEEKER_ID));
    expect(String(res.body.reviews[0].revieweeId)).toBe(String(PROVIDER_ID));
  });

  test('accepted provider can review the job seeker', async () => {
    const submit = await submitReviewAs(PROVIDER_TOKEN, SEEKER_ID, 4);
    expect(submit.status).toBe(201);

    const res = await getReviewsForJob();
    expect(res.body.reviews).toHaveLength(1);
    expect(String(res.body.reviews[0].reviewerId)).toBe(String(PROVIDER_ID));
    expect(String(res.body.reviews[0].revieweeId)).toBe(String(SEEKER_ID));
  });

  test('seeker cannot review an unrelated user', async () => {
    const res = await submitReviewAs(SEEKER_TOKEN, UNRELATED_ID, 5);
    expect(res.status).toBe(400);

    const after = await getReviewsForJob();
    expect(after.body.reviews).toHaveLength(0);
  });

  test('provider cannot review an unrelated user', async () => {
    const res = await submitReviewAs(PROVIDER_TOKEN, UNRELATED_ID, 5);
    expect(res.status).toBe(400);

    const after = await getReviewsForJob();
    expect(after.body.reviews).toHaveLength(0);
  });
});