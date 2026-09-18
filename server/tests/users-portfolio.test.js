/**
 * Public portfolio endpoint contract:
 *   - GET /api/users/:id/portfolio returns PUBLIC marketplace info only
 *     (name, role, avatar, bio, verified, rating, reviewCount + role stats).
 *   - Providers: jobsCompleted counts only jobs they were the accepted provider
 *     for AND that are status 'completed'.
 *   - Posters: tasksPosted + newest-first task list (no deleted tasks — deleted
 *     rows are hard-deleted, so nothing stale appears).
 *   - Reviews shown are only reviews received by the user, joined to COMPLETED
 *     jobs (task title included).
 *   - Private fields (email, phone, password_hash) must never appear.
 * Runs against the local SQLite driver (no DATABASE_URL set in tests).
 */
const request = require('supertest');
const express = require('express');

require('dotenv').config();

const usersRouter = require('../src/routes/users');
const { getDb, save } = require('../src/db');

const app = express();
app.use(express.json());
app.use('/api/users', usersRouter);

const SEEKER_ID = 13001;
const PROVIDER_ID = 13002;
const JOB_COMPLETED_A = 130101; // completed — counts toward both roles
const JOB_COMPLETED_B = 130102; // completed — counts toward both roles
const JOB_OPEN = 130103;        // open — must NOT count as completed

async function resetFixture() {
  const db = await getDb();
  db.run('DELETE FROM reviews WHERE job_id IN (?, ?, ?)', [JOB_COMPLETED_A, JOB_COMPLETED_B, JOB_OPEN]);
  db.run('DELETE FROM offers WHERE job_id IN (?, ?, ?)', [JOB_COMPLETED_A, JOB_COMPLETED_B, JOB_OPEN]);
  db.run('DELETE FROM jobs WHERE id IN (?, ?, ?)', [JOB_COMPLETED_A, JOB_COMPLETED_B, JOB_OPEN]);
  db.run(`INSERT OR REPLACE INTO users (id, name, email, phone, password_hash, role, is_verified, is_active, bio)
          VALUES (?, ?, ?, ?, ?, 'seeker', 1, 1, ?)`,
    [SEEKER_ID, 'Portfolio Seeker', 'portfolio-seeker@kaarya.demo', '98130011', 'test-hash', 'I post tasks.']);
  db.run(`INSERT OR REPLACE INTO users (id, name, email, phone, password_hash, role, is_verified, is_active, bio)
          VALUES (?, ?, ?, ?, ?, 'provider', 1, 1, ?)`,
    [PROVIDER_ID, 'Portfolio Provider', 'portfolio-provider@kaarya.demo', '98130012', 'test-hash', 'Handyman services.']);

  db.run(`INSERT INTO jobs (id, seeker_id, title, description, category, location, budget_min, budget_max, status, urgency, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'completed', 'normal', ?)`,
    [JOB_COMPLETED_A, SEEKER_ID, 'Fix Kitchen Sink', 'Leaking pipe under sink', 'plumbing', 'Kirtipur', 2000, 4000, '2026-01-01 10:00:00']);
  db.run(`INSERT INTO jobs (id, seeker_id, title, description, category, location, budget_min, budget_max, status, urgency, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'completed', 'normal', ?)`,
    [JOB_COMPLETED_B, SEEKER_ID, 'Repair Water Heater', 'Not heating', 'plumbing', 'Jhamsikhel', 3000, 6000, '2026-02-01 10:00:00']);
  db.run(`INSERT INTO jobs (id, seeker_id, title, description, category, location, budget_min, budget_max, status, urgency, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'open', 'normal', ?)`,
    [JOB_OPEN, SEEKER_ID, 'Paint Wall', 'Living room repaint', 'painting', 'Baneshwor', 8000, 12000, '2026-03-01 10:00:00']);

  db.run(`INSERT INTO offers (job_id, provider_id, amount, message, status) VALUES (?, ?, 3500, 'I can do this', 'accepted')`, [JOB_COMPLETED_A, PROVIDER_ID]);
  db.run(`INSERT INTO offers (job_id, provider_id, amount, message, status) VALUES (?, ?, 5000, 'Will fix today', 'accepted')`, [JOB_COMPLETED_B, PROVIDER_ID]);

  // Provider receives 2 reviews (from seeker), on completed jobs only.
  db.run(`INSERT INTO reviews (job_id, reviewer_id, reviewee_id, rating, comment, created_at)
          VALUES (?, ?, ?, 5, 'Excellent plumbing work', ?)`, [JOB_COMPLETED_A, SEEKER_ID, PROVIDER_ID, '2026-01-02 10:00:00']);
  db.run(`INSERT INTO reviews (job_id, reviewer_id, reviewee_id, rating, comment, created_at)
          VALUES (?, ?, ?, 4, 'Good work', ?)`, [JOB_COMPLETED_B, SEEKER_ID, PROVIDER_ID, '2026-02-02 10:00:00']);

  // Seeker receives 1 review (from provider).
  db.run(`INSERT INTO reviews (job_id, reviewer_id, reviewee_id, rating, comment, created_at)
          VALUES (?, ?, ?, 3, 'Nice client', ?)`, [JOB_COMPLETED_A, PROVIDER_ID, SEEKER_ID, '2026-01-03 10:00:00']);

  save();
}

function portfolio(id) {
  return request(app).get(`/api/users/${id}/portfolio`);
}

beforeEach(resetFixture);

describe('GET /api/users/:id/portfolio', () => {
  test('provider portfolio: jobsCompleted, rating, reviews with task titles', async () => {
    const res = await portfolio(PROVIDER_ID);
    expect(res.status).toBe(200);

    expect(res.body.user).toMatchObject({
      id: String(PROVIDER_ID),
      name: 'Portfolio Provider',
      role: 'provider',
      verified: true,
      jobsCompleted: 2,
      tasksPosted: 0,
      reviewCount: 2,
      rating: 4.5,
    });

    // Reviews received from the task poster, newest first, with task title.
    expect(res.body.reviews).toHaveLength(2);
    expect(res.body.reviews[0].jobTitle).toBe('Repair Water Heater'); // newer first
    expect(res.body.reviews[1].jobTitle).toBe('Fix Kitchen Sink');
    expect(res.body.reviews[0].reviewerName).toBe('Portfolio Seeker');
    expect(res.body.reviews[0].rating).toBe(4);
    expect(res.body.reviews[0].comment).toBe('Good work');

    expect(res.body.tasks).toEqual([]);
  });

  test('poster portfolio: tasks posted newest-first, received review, rating', async () => {
    const res = await portfolio(SEEKER_ID);
    expect(res.status).toBe(200);

    expect(res.body.user).toMatchObject({
      id: String(SEEKER_ID),
      name: 'Portfolio Seeker',
      role: 'seeker',
      tasksPosted: 3,
      jobsCompleted: 0,
      reviewCount: 1,
      rating: 3,
    });

    // Newest first.
    expect(res.body.tasks.map((t) => t.title)).toEqual([
      'Paint Wall',
      'Repair Water Heater',
      'Fix Kitchen Sink',
    ]);
    expect(res.body.tasks[0].status).toBe('open');
    expect(res.body.tasks[1].status).toBe('completed');

    expect(res.body.reviews).toHaveLength(1);
    expect(res.body.reviews[0].reviewerName).toBe('Portfolio Provider');
    expect(res.body.reviews[0].jobTitle).toBe('Fix Kitchen Sink');
  });

  test('empty user (poster with no activity) returns zeroed stats and empty lists', async () => {
    const db = await getDb();
    db.run(`INSERT OR REPLACE INTO users (id, name, email, phone, password_hash, role, is_verified, is_active)
            VALUES (?, ?, ?, ?, ?, 'provider', 1, 1)`,
      [13003, 'Quiet Worker', 'quiet@kaarya.demo', '98130013', 'test-hash']);
    save();

    const res = await portfolio(13003);
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ name: 'Quiet Worker', jobsCompleted: 0, reviewCount: 0, rating: null });
    expect(res.body.reviews).toEqual([]);
    expect(res.body.tasks).toEqual([]);
  });

  test('unknown user returns 404', async () => {
    const res = await portfolio(139999);
    expect(res.status).toBe(404);
  });

  test('never leaks private fields (email / phone / password_hash)', async () => {
    const res = await portfolio(PROVIDER_ID);
    const raw = JSON.stringify(res.body);
    expect(raw).not.toMatch(/email/i);
    expect(raw).not.toMatch(/password/i);
    expect(res.body.user).not.toHaveProperty('phone');
    expect(res.body.user).not.toHaveProperty('email');
  });
});