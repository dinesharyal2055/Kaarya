/**
 * GET /api/offers/received — seeker's received offers
 * Verifies:
 *   - endpoint is authentication-protected (401 without token)
 *   - only seekers may list received offers (403 for providers)
 *   - offers are scoped to jobs owned by the authenticated seeker
 *   - response shape matches what the mobile app expects (offer.jobId as
 *     string, offer.job sub-object, provider info, price, status)
 * Runs against the local SQLite driver (no DATABASE_URL set in tests).
 */
const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');

require('dotenv').config();

// offers.js loads the sanitize middleware only for POST/counter routes; its
// sanitize-html dependency is ESM-only and breaks jest's CJS runtime, so stub it.
jest.mock('../src/middleware/sanitize', () => ({
  sanitize: () => (req, res, next) => next(),
}));

const JWT_SECRET = process.env.JWT_SECRET;

const offersRouter = require('../src/routes/offers');
const { getDb, save } = require('../src/db');

const app = express();
app.use(express.json());
app.use('/api/offers', offersRouter);

// Test users / jobs / offers (high ids to avoid demo-seed collisions)
const SEEKER_A = 601;   // owns JOB_A
const SEEKER_B = 602;   // owns JOB_B
const PROVIDER_A = 603; // bids on JOB_A and JOB_B
const PROVIDER_B = 604; // bids on JOB_A
const JOB_A = 701;
const JOB_B = 702;
const OFFER_A1 = 801; // JOB_A <- PROVIDER_A
const OFFER_A2 = 802; // JOB_A <- PROVIDER_B
const OFFER_B1 = 803; // JOB_B <- PROVIDER_A

const tokenFor = (id) => jwt.sign({ userId: id }, JWT_SECRET, { expiresIn: '1h' });
const SEEKER_A_TOKEN = tokenFor(SEEKER_A);
const SEEKER_B_TOKEN = tokenFor(SEEKER_B);
const PROVIDER_A_TOKEN = tokenFor(PROVIDER_A);

async function seed() {
  const db = await getDb();

  // Seed users
  const users = [
    [SEEKER_A, 'Seeker A', 'seeker-a@kaarya.test', '980600001', 'h', 'seeker', 1, 1],
    [SEEKER_B, 'Seeker B', 'seeker-b@kaarya.test', '980600002', 'h', 'seeker', 1, 1],
    [PROVIDER_A, 'Provider A', 'provider-a@kaarya.test', '980600003', 'h', 'provider', 1, 1],
    [PROVIDER_B, 'Provider B', 'provider-b@kaarya.test', '980600004', 'h', 'provider', 1, 1],
  ];
  for (const u of users) {
    db.run('INSERT OR REPLACE INTO users (id, name, email, phone, password_hash, role, is_verified, is_active) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', u);
  }

  // Seed jobs (owned by a seeker, typed cols: id, seeker_id, title, category, location)
  db.run('INSERT OR REPLACE INTO jobs (id, seeker_id, title, description, category, location, budget_min, budget_max, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', [JOB_A, SEEKER_A, 'Fix kitchen sink', 'Leaking', 'plumbing', 'Kathmandu', 500, 2000, 'open']);
  db.run('INSERT OR REPLACE INTO jobs (id, seeker_id, title, description, category, location, budget_min, budget_max, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', [JOB_B, SEEKER_B, 'Paint wall', 'Two rooms', 'painting', 'Patan', 1000, 4000, 'open']);

  // Seed offers
  db.run('INSERT OR REPLACE INTO offers (id, job_id, provider_id, amount, message, status) VALUES (?, ?, ?, ?, ?, ?)', [OFFER_A1, JOB_A, PROVIDER_A, 1200, 'Can fix it today', 'pending']);
  db.run('INSERT OR REPLACE INTO offers (id, job_id, provider_id, amount, message, status) VALUES (?, ?, ?, ?, ?, ?)', [OFFER_A2, JOB_A, PROVIDER_B, 1500, 'Will come tomorrow', 'pending']);
  db.run('INSERT OR REPLACE INTO offers (id, job_id, provider_id, amount, message, status) VALUES (?, ?, ?, ?, ?, ?)', [OFFER_B1, JOB_B, PROVIDER_A, 2500, 'Painting expert', 'pending']);
  save();
}

async function cleanup() {
  const db = await getDb();
  db.run('DELETE FROM offers WHERE id IN (?, ?, ?)', [OFFER_A1, OFFER_A2, OFFER_B1]);
  db.run('DELETE FROM jobs WHERE id IN (?, ?)', [JOB_A, JOB_B]);
  db.run('DELETE FROM users WHERE id IN (?, ?, ?, ?)', [SEEKER_A, SEEKER_B, PROVIDER_A, PROVIDER_B]);
  save();
}

beforeAll(async () => {
  await cleanup();
  await getDb(); // ensure schema + demo seeds exist
  await seed();
});

afterAll(async () => {
  await cleanup();
});

describe('GET /api/offers/received', () => {
  test('returns 401 without a token', async () => {
    const res = await request(app).get('/api/offers/received');
    expect(res.status).toBe(401);
  });

  test('returns 403 for a provider', async () => {
    const res = await request(app)
      .get('/api/offers/received')
      .set('Authorization', `Bearer ${PROVIDER_A_TOKEN}`);
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('Only seekers can view received offers');
  });

  test('seeker sees only offers on jobs they own', async () => {
    const res = await request(app)
      .get('/api/offers/received')
      .set('Authorization', `Bearer ${SEEKER_A_TOKEN}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.offers)).toBe(true);
    expect(res.body.offers).toHaveLength(2);

    const ids = res.body.offers.map((o) => Number(o.id)).sort();
    expect(ids).toEqual([OFFER_A1, OFFER_A2].sort((a, b) => a - b));

    const offerIds = res.body.offers.map((o) => o.id);
    expect(offerIds).not.toContain(String(OFFER_B1)); // JOB_B belongs to another seeker
  });

  test('returned offers carry the shape the mobile app expects', async () => {
    const res = await request(app)
      .get('/api/offers/received')
      .set('Authorization', `Bearer ${SEEKER_A_TOKEN}`);
    const offer = res.body.offers.find((o) => String(o.id) === String(OFFER_A1));

    expect(offer).toBeDefined();
    expect(offer.id).toBe(OFFER_A1);               // real offer id (accept/reject target)
    expect(offer.jobId).toBe(JOB_A);               // number, matches Job.id runtime type
    expect(offer.status).toBe('pending');
    expect(typeof offer.price).toBe('number');     // Rs. toLocaleString()
    expect(offer.providerName).toBe('Provider A'); // providerFromRow
    expect(typeof offer.providerId).toBe('string');

    expect(offer.job).toBeDefined();               // offers.tsx OfferCard
    expect(offer.job.id).toBe(JOB_A);
    expect(offer.job.title).toBe('Fix kitchen sink');
    expect(offer.job.category).toBe('plumbing');
    expect(offer.job.area).toBe('Kathmandu');
    expect(offer.job.status).toBe('open');
  });

  test('a different seeker only gets their own job offers', async () => {
    const res = await request(app)
      .get('/api/offers/received')
      .set('Authorization', `Bearer ${SEEKER_B_TOKEN}`);
    expect(res.status).toBe(200);
    expect(res.body.offers).toHaveLength(1);
    expect(res.body.offers[0].jobId).toBe(JOB_B);
  });
});