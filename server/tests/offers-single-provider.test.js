/**
 * Strict single-provider assignment contract:
 *  - A job may hold many pending offers before assignment.
 *  - Accepting one offer assigns the job, rejects every other pending offer,
 *    and leaves exactly ONE accepted (assigned) provider.
 *  - Accepting a second offer fails once the task is assigned (400) — this is
 *    enforced independently of the offer's own status, so even a stale pending
 *    offer cannot be accepted on an assigned job (closes the accept race).
 *  - Creating a new offer after assignment fails (400 — job not open).
 *  - Only the accepted provider can start the assigned workflow (403 for others).
 * Runs against the local SQLite driver (no DATABASE_URL set in tests).
 */
const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');

require('dotenv').config();

// The offer-submission limiter caps at 10 requests / 15 min per IP, which
// would flake a suite that repeatedly creates offers in-band. Disable it for
// this file only and restore the previous value afterwards.
const PREV_RATE_LIMIT = process.env.RATE_LIMIT_ENABLED;
process.env.RATE_LIMIT_ENABLED = '0';

// sanitize-html's htmlparser2 dependency is ESM-only and Jest's CJS loader
// cannot require it (latent infra limitation for any test that mounts a router
// using the sanitize middleware). Identity mock is safe — our messages are plain text.
jest.mock('sanitize-html', () => (html) => html);

const JWT_SECRET = process.env.JWT_SECRET;
const SEEKER_TOKEN = jwt.sign({ userId: 11001 }, JWT_SECRET, { expiresIn: '1h' });
const PROVIDER_A_TOKEN = jwt.sign({ userId: 11002 }, JWT_SECRET, { expiresIn: '1h' });
const PROVIDER_B_TOKEN = jwt.sign({ userId: 11003 }, JWT_SECRET, { expiresIn: '1h' });

const offersRouter = require('../src/routes/offers');
const jobsRouter = require('../src/routes/jobs');
const { getDb, save } = require('../src/db');

const app = express();
app.use(express.json());
app.use('/api/offers', offersRouter);
app.use('/api/jobs', jobsRouter);

const SEEKER_ID = 11001;
const PROVIDER_A = 11002;
const PROVIDER_B = 11003;
const JOB_ID = 115001;

async function resetFixture() {
  const db = await getDb();
  db.run('DELETE FROM offers WHERE job_id = ?', [JOB_ID]);
  db.run('DELETE FROM conversations WHERE job_id = ?', [JOB_ID]);
  db.run('DELETE FROM jobs WHERE id = ?', [JOB_ID]);
  db.run(`INSERT OR REPLACE INTO users (id, name, email, phone, password_hash, role, is_verified, is_active)
          VALUES (?, ?, ?, ?, ?, 'seeker', 1, 1)`,
    [SEEKER_ID, 'Single Provider Seeker', 'single-seeker@kaarya.demo', '98110011', 'test-hash']);
  db.run(`INSERT OR REPLACE INTO users (id, name, email, phone, password_hash, role, is_verified, is_active)
          VALUES (?, ?, ?, ?, ?, 'provider', 1, 1)`,
    [PROVIDER_A, 'Provider Alpha', 'provider-alpha@kaarya.demo', '98110012', 'test-hash']);
  db.run(`INSERT OR REPLACE INTO users (id, name, email, phone, password_hash, role, is_verified, is_active)
          VALUES (?, ?, ?, ?, ?, 'provider', 1, 1)`,
    [PROVIDER_B, 'Provider Bravo', 'provider-bravo@kaarya.demo', '98110013', 'test-hash']);
  db.run(`INSERT INTO jobs (id, seeker_id, title, description, category, location, budget_min, budget_max, status, urgency)
          VALUES (?, ?, 'Repair rooftop', 'Waterproofing needed', 'maintenance', 'Kirtipur', 8000, 15000, 'open', 'normal')`,
    [JOB_ID, SEEKER_ID]);
  save();
}

function makeOfferAs(token, price) {
  return request(app)
    .post('/api/offers')
    .set('Authorization', `Bearer ${token}`)
    .send({ jobId: String(JOB_ID), price, message: 'I can do this job' });
}

function acceptAsSeeker(offerId) {
  return request(app)
    .post(`/api/offers/${offerId}/accept`)
    .set('Authorization', `Bearer ${SEEKER_TOKEN}`);
}

function startAs(token) {
  return request(app)
    .post(`/api/jobs/${JOB_ID}/start`)
    .set('Authorization', `Bearer ${token}`);
}

async function latestOfferByProvider(providerId) {
  const db = await getDb();
  const res = db.exec('SELECT id, status FROM offers WHERE job_id = ? AND provider_id = ? ORDER BY id DESC LIMIT 1', [JOB_ID, providerId]);
  return { id: res[0].values[0][0], status: res[0].values[0][1] };
}

async function jobStatus() {
  const db = await getDb();
  const res = db.exec('SELECT status FROM jobs WHERE id = ?', [JOB_ID]);
  return res[0].values[0][0];
}

beforeAll(async () => {
  await getDb();
  await resetFixture();
});

afterAll(async () => {
  const db = await getDb();
  db.run('DELETE FROM offers WHERE job_id = ?', [JOB_ID]);
  db.run('DELETE FROM conversations WHERE job_id = ?', [JOB_ID]);
  db.run('DELETE FROM jobs WHERE id = ?', [JOB_ID]);
  db.run('DELETE FROM users WHERE id IN (?, ?, ?)', [SEEKER_ID, PROVIDER_A, PROVIDER_B]);
  save();
  if (PREV_RATE_LIMIT === undefined) delete process.env.RATE_LIMIT_ENABLED;
  else process.env.RATE_LIMIT_ENABLED = PREV_RATE_LIMIT;
});

describe('Strict single-provider assignment', () => {
  beforeEach(async () => { await resetFixture(); });

  test('a job may hold multiple pending offers before assignment', async () => {
    const resA = await makeOfferAs(PROVIDER_A_TOKEN, 9000);
    expect(resA.status).toBe(201);
    const resB = await makeOfferAs(PROVIDER_B_TOKEN, 10000);
    expect(resB.status).toBe(201);

    const db = await getDb();
    const row = db.exec("SELECT COUNT(*) FROM offers WHERE job_id = ? AND status = 'pending'", [JOB_ID]);
    expect(row[0].values[0][0]).toBe(2);
    expect(await jobStatus()).toBe('open');
  });

  test('accepting an offer assigns the job and rejects every other pending offer', async () => {
    await makeOfferAs(PROVIDER_A_TOKEN, 9000);
    await makeOfferAs(PROVIDER_B_TOKEN, 10000);
    const a = await latestOfferByProvider(PROVIDER_A);

    const res = await acceptAsSeeker(a.id);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('accepted');
    expect(await jobStatus()).toBe('assigned');

    const aAfter = await latestOfferByProvider(PROVIDER_A);
    const bAfter = await latestOfferByProvider(PROVIDER_B);
    expect(aAfter.status).toBe('accepted');
    expect(bAfter.status).toBe('rejected');
  });

  test('accepting a second offer fails once the task is assigned', async () => {
    await makeOfferAs(PROVIDER_A_TOKEN, 9000);
    await makeOfferAs(PROVIDER_B_TOKEN, 10000);
    const a = await latestOfferByProvider(PROVIDER_A);
    const b = await latestOfferByProvider(PROVIDER_B);

    expect((await acceptAsSeeker(a.id)).status).toBe(200);

    const res = await acceptAsSeeker(b.id);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Only pending offers can be accepted');
    expect(await jobStatus()).toBe('assigned');
  });

  test('a stale pending offer can never be accepted on an already-assigned job (race guard)', async () => {
    await makeOfferAs(PROVIDER_A_TOKEN, 9000);
    const a = await latestOfferByProvider(PROVIDER_A);
    expect((await acceptAsSeeker(a.id)).status).toBe(200);

    // Simulate a pending offer somehow surviving assignment (concurrent accept race).
    const db = await getDb();
    db.run("INSERT INTO offers (job_id, provider_id, amount, message, status) VALUES (?, ?, ?, ?, 'pending')",
      [JOB_ID, PROVIDER_B, 10000, 'late bid']);
    save();
    const b = await latestOfferByProvider(PROVIDER_B);

    const res = await acceptAsSeeker(b.id);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('This task has already been assigned to a provider');
    expect(await jobStatus()).toBe('assigned');
  });

  test('creating a new offer once the task is assigned fails', async () => {
    await makeOfferAs(PROVIDER_A_TOKEN, 9000);
    const a = await latestOfferByProvider(PROVIDER_A);
    expect((await acceptAsSeeker(a.id)).status).toBe(200);

    const res = await makeOfferAs(PROVIDER_B_TOKEN, 9500);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Job is not open for offers');
  });

  test('only one provider is ever assigned after acceptance', async () => {
    await makeOfferAs(PROVIDER_A_TOKEN, 9000);
    await makeOfferAs(PROVIDER_B_TOKEN, 10000);
    const a = await latestOfferByProvider(PROVIDER_A);
    expect((await acceptAsSeeker(a.id)).status).toBe(200);

    const db = await getDb();
    const row = db.exec("SELECT provider_id, COUNT(*) FROM offers WHERE job_id = ? AND status = 'accepted' GROUP BY provider_id", [JOB_ID]);
    expect(row[0].values).toHaveLength(1);
    expect(String(row[0].values[0][0])).toBe(String(PROVIDER_A));
    expect(row[0].values[0][1]).toBe(1);
  });

  test('a provider who was not selected cannot start the assigned job', async () => {
    await makeOfferAs(PROVIDER_A_TOKEN, 9000);
    await makeOfferAs(PROVIDER_B_TOKEN, 10000);
    const a = await latestOfferByProvider(PROVIDER_A);
    expect((await acceptAsSeeker(a.id)).status).toBe(200);

    const res = await startAs(PROVIDER_B_TOKEN);
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('Only the accepted provider can start this job');
    expect(await jobStatus()).toBe('assigned');
  });

  test('the accepted provider can start the assigned job', async () => {
    await makeOfferAs(PROVIDER_A_TOKEN, 9000);
    await makeOfferAs(PROVIDER_B_TOKEN, 10000);
    const a = await latestOfferByProvider(PROVIDER_A);
    expect((await acceptAsSeeker(a.id)).status).toBe(200);

    const res = await startAs(PROVIDER_A_TOKEN);
    expect(res.status).toBe(200);
    expect(await jobStatus()).toBe('in_progress');
  });
});