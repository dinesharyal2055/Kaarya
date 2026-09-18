/**
 * Reviews-by-job contract — backs the client's "Review submitted" state:
 *   - GET /api/reviews/job/:jobId returns every review left on a job, each
 *     including reviewerId (used by the client to check whether the current
 *     user already reviewed the job and disable the Leave Review button).
 *   - An unreviewed job returns an empty list.
 * Runs against the local SQLite driver (no DATABASE_URL set in tests).
 */
const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');

require('dotenv').config();

// sanitize-html's htmlparser2 dependency is ESM-only and Jest's CJS loader
// cannot require it (latent infra limitation for any test that mounts a router
// using the sanitize middleware). Identity mock is safe — our comments are plain text.
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
const JOB_ID = 125001;

async function resetFixture() {
  const db = await getDb();
  db.run('DELETE FROM reviews WHERE job_id = ?', [JOB_ID]);
  db.run('DELETE FROM offers WHERE job_id = ?', [JOB_ID]);
  db.run('DELETE FROM notifications WHERE data LIKE ?', [`%${JOB_ID}%`]);
  db.run('DELETE FROM jobs WHERE id = ?', [JOB_ID]);
  db.run(`INSERT OR REPLACE INTO users (id, name, email, phone, password_hash, role, is_verified, is_active)
          VALUES (?, ?, ?, ?, ?, 'seeker', 1, 1)`,
    [SEEKER_ID, 'Review Job Seeker', 'review-jobs-seeker@kaarya.demo', '98120011', 'test-hash']);
  db.run(`INSERT OR REPLACE INTO users (id, name, email, phone, password_hash, role, is_verified, is_active)
          VALUES (?, ?, ?, ?, ?, 'provider', 1, 1)`,
    [PROVIDER_ID, 'Review Job Provider', 'review-jobs-provider@kaarya.demo', '98120012', 'test-hash']);
  db.run(`INSERT INTO jobs (id, seeker_id, title, description, category, location, budget_min, budget_max, status, urgency)
          VALUES (?, ?, 'Repair water heater', 'Geyser not heating', 'plumbing', 'Jhamsikhel', 3000, 6000, 'completed', 'normal')`,
    [JOB_ID, SEEKER_ID]);
  db.run(`INSERT INTO offers (job_id, provider_id, amount, message, status)
          VALUES (?, ?, 4500, 'I can fix this today', 'accepted')`,
    [JOB_ID, PROVIDER_ID]);
  save();
}

function getReviewsForJob() {
  return request(app).get(`/api/reviews/job/${JOB_ID}`);
}

function submitReviewAs(token, revieweeId, rating, comment) {
  return request(app)
    .post('/api/reviews')
    .set('Authorization', `Bearer ${token}`)
    .send({ jobId: String(JOB_ID), revieweeId: String(revieweeId), rating, comment });
}

beforeEach(resetFixture);

describe('GET /api/reviews/job/:jobId', () => {
  test('returns an empty list when the job has no reviews yet', async () => {
    const res = await getReviewsForJob();
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ reviews: [] });
  });

  test('returns the review with reviewerId/name once the seeker has reviewed', async () => {
    const submit = await submitReviewAs(SEEKER_TOKEN, PROVIDER_ID, 5, 'Great work, quick service');
    expect(submit.status).toBe(201);

    const res = await getReviewsForJob();
    expect(res.status).toBe(200);
    expect(res.body.reviews).toHaveLength(1);
    const r = res.body.reviews[0];
    expect(String(r.reviewerId)).toBe(String(SEEKER_ID));
    expect(r.reviewerName).toBe('Review Job Seeker');
    expect(String(r.revieweeId)).toBe(String(PROVIDER_ID));
    expect(r.rating).toBe(5);
    expect(r.comment).toBe('Great work, quick service');
  });

  test('returns every review left on the job (seeker + provider both reviewed)', async () => {
    await submitReviewAs(SEEKER_TOKEN, PROVIDER_ID, 5, 'Great work');
    await submitReviewAs(PROVIDER_TOKEN, SEEKER_ID, 4, 'Nice client');

    const res = await getReviewsForJob();
    expect(res.status).toBe(200);
    expect(res.body.reviews).toHaveLength(2);
    const reviewers = res.body.reviews.map((r) => String(r.reviewerId));
    expect(reviewers).toEqual(expect.arrayContaining([String(SEEKER_ID), String(PROVIDER_ID)]));
  });
});