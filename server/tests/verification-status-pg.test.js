/**
 * Regression: the admin rejection reason must reach the mobile client.
 *
 * The rest of the backend suite runs the SQLite driver, but production uses
 * PostgreSQL (Neon). This file forces the Postgres branch of
 * GET /api/verification/status with a fake pg-shaped client and proves the
 * rejection reason the admin stored in admin_notes is returned as adminNotes
 * — the camelCase key the mobile screen reads
 * (src/app/verification.tsx renders `existingRequest.adminNotes` and only
 * falls back to "No additional details were provided" when it is absent).
 */
const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');

require('dotenv').config();

const PREV_DATABASE_URL = process.env.DATABASE_URL;
process.env.DATABASE_URL = 'postgres://kaarya_test:kaarya_test@localhost:5432/kaarya_test';

const JWT_SECRET = process.env.JWT_SECRET;
const TEST_USER_ID = 611;
const TEST_USER_TOKEN = jwt.sign({ userId: TEST_USER_ID }, JWT_SECRET, { expiresIn: '1h' });

const REASON = 'Test rejection: please upload a clearer document';

jest.mock('../src/db', () => ({
  getDb: jest.fn(),
  usePostgres: true,
  save: jest.fn(),
  getClient: jest.fn(),
}));

const db = require('../src/db');
const verificationRouter = require('../src/routes/verification');

const fakeClient = {
  query: jest.fn(async (sql) => {
    if (/FROM verification_requests/.test(sql)) {
      return {
        rowCount: 1,
        rows: [
          {
            id: 622,
            user_id: TEST_USER_ID,
            level: 3,
            document_type: 'citizenship',
            documents: JSON.stringify(['/uploads/verification/clearer-document.jpg']),
            notes: null,
            status: 'rejected',
            admin_notes: REASON,
            created_at: '2026-01-15T10:00:00.000Z',
            updated_at: '2026-01-16T10:00:00.000Z',
          },
        ],
      };
    }
    return { rowCount: 0, rows: [] };
  }),
};

const app = express();
app.use(express.json());
app.use('/api/verification', verificationRouter);

beforeAll(() => {
  db.getDb.mockImplementation(async () => fakeClient);
  db.getClient.mockImplementation(async () => fakeClient);
});

afterAll(() => {
  if (PREV_DATABASE_URL === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = PREV_DATABASE_URL;
});

describe('rejection reason data flow — Postgres driver', () => {
  test('GET /api/verification/status returns the admin rejection reason as adminNotes', async () => {
    const res = await request(app)
      .get('/api/verification/status')
      .set('Authorization', `Bearer ${TEST_USER_TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('rejected');
    expect(res.body.request.adminNotes).toBe(REASON);
    expect(res.body.request.documents).toEqual(['/uploads/verification/clearer-document.jpg']);
  });
});