/**
 * Task deletion — poster + Super Admin.
 *
 * Poster rules:
 *  - May only delete their OWN task while it is still 'open' AND has never had
 *    any offer (historic). This is stricter than editing, which re-opens once
 *    every offer has been rejected.
 *  - Completed / assigned / in_progress tasks stay in the poster's history.
 *
 * Admin rules:
 *  - Requires authentication + admin role.
 *  - May delete ANY task regardless of status or offer history.
 *  - Cleanup: offers, negotiations, reviews, saved bookmarks, job-related
 *    notifications, conversations/messages, and stored photo files. Users and
 *    unrelated records are left untouched.
 *
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
const ADMIN_TOKEN = jwt.sign({ userId: 9003 }, JWT_SECRET, { expiresIn: '1h' });

const jobsRouter = require('../src/routes/jobs');
const offersRouter = require('../src/routes/offers');
const adminRouter = require('../src/routes/admin');
const { getDb, save } = require('../src/db');

const app = express();
app.use(express.json());
app.use('/api/jobs', jobsRouter);
app.use('/api/offers', offersRouter);
app.use('/api/admin', adminRouter);

const JOB_ID = 90001;
const OWNER_ID = 9001;
const PROVIDER_ID = 9002;
const ADMIN_ID = 9003;

async function resetFixture() {
  const db = await getDb();
  // FK-safe cleanup of any residue from previous runs
  db.run('DELETE FROM messages WHERE conversation_id IN (SELECT id FROM conversations WHERE job_id = ?)', [JOB_ID]);
  db.run('DELETE FROM conversation_participants WHERE conversation_id IN (SELECT id FROM conversations WHERE job_id = ?)', [JOB_ID]);
  db.run('DELETE FROM conversations WHERE job_id = ?', [JOB_ID]);
  db.run('DELETE FROM offers WHERE job_id = ?', [JOB_ID]);
  db.run('DELETE FROM negotiations WHERE job_id = ?', [JOB_ID]);
  db.run('DELETE FROM reviews WHERE job_id = ?', [JOB_ID]);
  db.run('DELETE FROM saved_jobs WHERE job_id = ?', [JOB_ID]);
  db.run("DELETE FROM notifications WHERE data LIKE ? OR data LIKE ?", [`%"jobId":${JOB_ID}%`, `%"jobId":"${JOB_ID}"%`]);
  db.run('DELETE FROM jobs WHERE id = ?', [JOB_ID]);

  db.run(`INSERT OR REPLACE INTO users (id, name, email, phone, password_hash, role, is_verified, is_active, is_admin)
          VALUES (?, ?, ?, ?, ?, 'seeker', 1, 1, 0)`,
    [OWNER_ID, 'Task Poster', 'poster@kaarya.demo', '98090001', 'test-hash']);
  db.run(`INSERT OR REPLACE INTO users (id, name, email, phone, password_hash, role, is_verified, is_active, is_admin)
          VALUES (?, ?, ?, ?, ?, 'provider', 1, 1, 0)`,
    [PROVIDER_ID, 'Bidder Provider', 'bidder@kaarya.demo', '98090002', 'test-hash']);
  db.run(`INSERT OR REPLACE INTO users (id, name, email, phone, password_hash, role, is_verified, is_active, is_admin)
          VALUES (?, ?, ?, ?, ?, 'admin', 1, 1, 1)`,
    [ADMIN_ID, 'Super Admin', 'delete-admin@kaarya.demo', '98090003', 'test-hash']);
  db.run(`INSERT INTO jobs (id, seeker_id, title, description, category, location, budget_min, budget_max, status, urgency)
          VALUES (?, ?, 'Repair balcony', 'Need masonry work', 'maintenance', 'Tokha', 3000, 5000, 'open', 'normal')`,
    [JOB_ID, OWNER_ID]);
  save();
}

function deleteOwned() {
  return request(app)
    .delete(`/api/jobs/${JOB_ID}`)
    .set('Authorization', `Bearer ${OWNER_TOKEN}`);
}

function deleteAsProvider() {
  return request(app)
    .delete(`/api/jobs/${JOB_ID}`)
    .set('Authorization', `Bearer ${PROVIDER_TOKEN}`);
}

function deleteAnonymously() {
  return request(app).delete(`/api/jobs/${JOB_ID}`);
}

function makeOffer() {
  return request(app)
    .post('/api/offers')
    .set('Authorization', `Bearer ${PROVIDER_TOKEN}`)
    .send({ jobId: String(JOB_ID), price: 4000, message: 'I can do it' });
}

function adminDelete() {
  return request(app)
    .delete(`/api/admin/jobs/${JOB_ID}`)
    .set('Authorization', `Bearer ${ADMIN_TOKEN}`);
}

function adminDeleteAsProvider() {
  return request(app)
    .delete(`/api/admin/jobs/${JOB_ID}`)
    .set('Authorization', `Bearer ${PROVIDER_TOKEN}`);
}

async function jobExists(jobId) {
  return request(app)
    .get(`/api/jobs/${jobId}`)
    .set('Authorization', `Bearer ${OWNER_TOKEN}`);
}

beforeAll(async () => { await getDb(); });

describe('DELETE /api/jobs/:id — poster deletion', () => {
  beforeEach(async () => { await resetFixture(); });

  test('owner can delete their own open task that has no offers', async () => {
    const res = await deleteOwned();
    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Job deleted successfully');

    const after = await jobExists(JOB_ID);
    expect(after.status).toBe(404);
  });

  test('deleted task no longer appears in the public browse listing', async () => {
    await deleteOwned();

    const browse = await request(app).get('/api/jobs');
    expect(browse.status).toBe(200);
    const ids = browse.body.jobs.map((j) => String(j.id));
    expect(ids).not.toContain(String(JOB_ID));
  });

  test('owner cannot delete after a pending offer has been placed', async () => {
    const offerRes = await makeOffer();
    expect(offerRes.status).toBe(201);

    const res = await deleteOwned();
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('OFFERS_EXIST');
  });

  test('owner cannot delete once an offer has EVER existed (even if rejected) — stricter than editing', async () => {
    await makeOffer();
    const db = await getDb();
    db.run("UPDATE offers SET status = 'rejected' WHERE job_id = ?", [JOB_ID]);
    save();

    // Editing re-opens after all offers are rejected; deletion stays forbidden.
    const res = await deleteOwned();
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('OFFERS_EXIST');
  });

  test('completed task cannot be deleted and stays in history', async () => {
    const db = await getDb();
    db.run("UPDATE jobs SET status = 'completed' WHERE id = ?", [JOB_ID]);
    save();

    const res = await deleteOwned();
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('NOT_OPEN');

    const after = await jobExists(JOB_ID);
    expect(after.status).toBe(200);
    expect(after.body.status).toBe('completed');
  });

  test('non-owner provider cannot delete the poster task', async () => {
    const res = await deleteAsProvider();
    expect(res.status).toBe(403);
  });

  test('unauthenticated request is rejected', async () => {
    const res = await deleteAnonymously();
    expect(res.status).toBe(401);
  });
});

describe('DELETE /api/admin/jobs/:id — Super Admin deletion', () => {
  beforeEach(async () => { await resetFixture(); });

  test('non-admin user is forbidden from the admin delete endpoint', async () => {
    const res = await adminDeleteAsProvider();
    expect(res.status).toBe(403);
  });

  test('admin can delete an open task that has offers; offers + notifications + saved_jobs + negotiations are cleaned up', async () => {
    await makeOffer();
    const db = await getDb();
    db.run('INSERT INTO saved_jobs (user_id, job_id) VALUES (?, ?)', [PROVIDER_ID, JOB_ID]);
    db.run('INSERT INTO negotiations (job_id, provider_id, seeker_id, proposed_amount, status) VALUES (?, ?, ?, ?, ?)',
      [JOB_ID, PROVIDER_ID, OWNER_ID, 4200, 'open']);
    db.run(`INSERT INTO notifications (user_id, type, title, body, data) VALUES (?, 'new_offer', 'New offer', 'Offer body', ?)`,
      [OWNER_ID, JSON.stringify({ type: 'new_offer', jobId: String(JOB_ID), offerId: '1' })]);
    save();

    const res = await adminDelete();
    expect(res.status).toBe(200);

    const offers = db.exec('SELECT COUNT(*) FROM offers WHERE job_id = ?', [JOB_ID]);
    const saved = db.exec('SELECT COUNT(*) FROM saved_jobs WHERE job_id = ?', [JOB_ID]);
    const negot = db.exec('SELECT COUNT(*) FROM negotiations WHERE job_id = ?', [JOB_ID]);
    const notifs = db.exec("SELECT COUNT(*) FROM notifications WHERE data LIKE ? OR data LIKE ?", [`%"jobId":${JOB_ID}%`, `%"jobId":"${JOB_ID}"%`]);
    const jobs = db.exec('SELECT COUNT(*) FROM jobs WHERE id = ?', [JOB_ID]);
    expect(offers[0].values[0][0]).toBe(0);
    expect(saved[0].values[0][0]).toBe(0);
    expect(negot[0].values[0][0]).toBe(0);
    expect(notifs[0].values[0][0]).toBe(0);
    expect(jobs[0].values[0][0]).toBe(0);

    // Users are left untouched
    const adminUser = db.exec('SELECT COUNT(*) FROM users WHERE id = ?', [ADMIN_ID]);
    const providerUser = db.exec('SELECT COUNT(*) FROM users WHERE id = ?', [PROVIDER_ID]);
    expect(adminUser[0].values[0][0]).toBe(1);
    expect(providerUser[0].values[0][0]).toBe(1);
  });

  test('admin can delete a completed task with a review; review is cleaned, users remain', async () => {
    const db = await getDb();
    db.run("UPDATE jobs SET status = 'completed' WHERE id = ?", [JOB_ID]);
    db.run('INSERT INTO reviews (job_id, reviewer_id, reviewee_id, rating, comment) VALUES (?, ?, ?, ?, ?)',
      [JOB_ID, PROVIDER_ID, OWNER_ID, 5, 'Great work']);
    save();

    const res = await adminDelete();
    expect(res.status).toBe(200);

    const reviews = db.exec('SELECT COUNT(*) FROM reviews WHERE job_id = ?', [JOB_ID]);
    const jobs = db.exec('SELECT COUNT(*) FROM jobs WHERE id = ?', [JOB_ID]);
    expect(reviews[0].values[0][0]).toBe(0);
    expect(jobs[0].values[0][0]).toBe(0);

    const owner = db.exec('SELECT COUNT(*) FROM users WHERE id = ?', [OWNER_ID]);
    expect(owner[0].values[0][0]).toBe(1);

    // No longer present in the admin jobs listing
    const adminList = await request(app)
      .get('/api/admin/jobs')
      .set('Authorization', `Bearer ${ADMIN_TOKEN}`);
    expect(adminList.status).toBe(200);
    const ids = adminList.body.jobs.map((j) => String(j.id));
    expect(ids).not.toContain(String(JOB_ID));
  });
});