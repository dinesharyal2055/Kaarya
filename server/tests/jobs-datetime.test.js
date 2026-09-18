/**
 * Job date & time (scheduledDate) validation & persistence:
 *  - Creating a job may omit the date (server treats it as optional).
 *  - A valid future ISO timestamp (+05:45 Nepal offset) is stored and echoed.
 *  - A past timestamp and a non-ISO value are rejected with 400.
 *  - Editing an open job accepts a new scheduled date and can clear it.
 * Runs against the local SQLite driver (no DATABASE_URL set in tests).
 */
const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');

require('dotenv').config();

jest.mock('sanitize-html', () => (html) => html);

const JWT_SECRET = process.env.JWT_SECRET;
const OWNER_TOKEN = jwt.sign({ userId: 9001 }, JWT_SECRET, { expiresIn: '1h' });

const jobsRouter = require('../src/routes/jobs');
const { getDb, save } = require('../src/db');

const app = express();
app.use(express.json());
app.use('/api/jobs', jobsRouter);

const FIXED_JOB_ID = 91001;
const OWNER_ID = 9001;

const FUTURE_ISO = '2030-01-05T09:30:00+05:45';
const PAST_ISO = '2020-01-05T09:30:00+05:45';

async function resetFixture() {
  const db = await getDb();
  db.run('DELETE FROM jobs WHERE id = ?', [FIXED_JOB_ID]);
  db.run(`INSERT OR REPLACE INTO users (id, name, email, phone, password_hash, role, is_verified, is_active)
          VALUES (?, ?, ?, ?, ?, 'seeker', 1, 1)`,
    [OWNER_ID, 'Datetime Poster', 'datetime@kaarya.demo', '98091001', 'test-hash']);
  db.run(`INSERT INTO jobs (id, seeker_id, title, description, category, location, budget_min, budget_max, status)
          VALUES (?, ?, 'Install CCTV', 'Need camera installation', 'security', 'Gongabu', 4000, 7000, 'open')`,
    [FIXED_JOB_ID, OWNER_ID]);
  save();
}

function createJob(data = {}) {
  return request(app)
    .post('/api/jobs')
    .set('Authorization', `Bearer ${OWNER_TOKEN}`)
    .send({
      title: 'Install smart lock',
      description: 'Please install a smart lock on the main door',
      category: 'security',
      location: 'Baneshwor',
      budgetMin: 3000,
      budgetMax: 5000,
      ...data,
    });
}

function editJob(data = {}) {
  return request(app)
    .patch(`/api/jobs/${FIXED_JOB_ID}`)
    .set('Authorization', `Bearer ${OWNER_TOKEN}`)
    .send(data);
}

beforeAll(async () => { await getDb(); });

describe('Job scheduled date (POST /api/jobs)', () => {
  beforeEach(async () => { await resetFixture(); });

  test('omitting scheduledDate still creates the job (date null)', async () => {
    const res = await createJob();
    expect(res.status).toBe(201);
    expect(res.body.scheduledDate).toBe(null);
  });

  test('a valid future ISO timestamp is stored and echoed unchanged', async () => {
    const res = await createJob({ scheduledDate: FUTURE_ISO });
    expect(res.status).toBe(201);
    expect(res.body.scheduledDate).toBe(FUTURE_ISO);
  });

  test('a past ISO timestamp is rejected with 400', async () => {
    const res = await createJob({ scheduledDate: PAST_ISO });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Scheduled date');
  });

  test('a non-ISO value is rejected with 400', async () => {
    const res = await createJob({ scheduledDate: 'tomorrow' });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Scheduled date');
  });
});

describe('Job scheduled date (PATCH /api/jobs/:id)', () => {
  beforeEach(async () => { await resetFixture(); });

  test('editing to a valid future timestamp updates the stored date', async () => {
    const res = await editJob({ scheduledDate: FUTURE_ISO });
    expect(res.status).toBe(200);
    expect(res.body.scheduledDate).toBe(FUTURE_ISO);
  });

  test('clearing the date is allowed (scheduledDate null)', async () => {
    await editJob({ scheduledDate: FUTURE_ISO });
    const res = await editJob({ scheduledDate: null });
    expect(res.status).toBe(200);
    expect(res.body.scheduledDate).toBe(null);
  });

  test('a past timestamp is rejected with 400', async () => {
    const res = await editJob({ scheduledDate: PAST_ISO });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Scheduled date');
  });
});