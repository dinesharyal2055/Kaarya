/**
 * Uploads public-access test.
 *
 * Verifies:
 *   1. Avatar images are publicly readable (GET /uploads/avatars/:filename
 *      returns 200 without an Authorization header).
 *   2. Job photos are publicly readable (GET /uploads/jobs/:filename without
 *      an Authorization header).
 *   3. Verification documents still REQUIRE authentication (GET
 *      /uploads/verification/:filename without a token returns 401).
 *
 * All writes go to the local filesystem fallback (R2 vars cleared); files are
 * cleaned up in afterAll.
 */
const request = require('supertest');
const express = require('express');
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');

require('dotenv').config();

const JWT_SECRET = process.env.JWT_SECRET;
const storage = require('../src/storage');
const { requireAuth } = require('../src/middleware/auth');

// ── tiny test app (matches index.js wiring) ──────────────────────────────────
const app = express();
app.get('/uploads/avatars/:filename', storage.createAvatarDownloadHandler());
app.get('/uploads/jobs/:filename', storage.createJobPhotoDownloadHandler());
app.get('/uploads/verification/:filename', requireAuth, storage.createVerificationDownloadHandler());

// ── helpers ──────────────────────────────────────────────────────────────────
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(32, 0xab)]);
const AVATAR_DIR = path.join(__dirname, '..', 'src', 'uploads', 'avatars');
const JOB_DIR = path.join(__dirname, '..', 'src', 'uploads', 'jobs');
const VERIF_DIR = path.join(__dirname, '..', 'src', 'uploads', 'verification');

const createdFiles = [];

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

beforeAll(() => {
  // Ensure local dirs exist and write sample files.
  ensureDir(AVATAR_DIR);
  ensureDir(JOB_DIR);
  ensureDir(VERIF_DIR);

  const avatarPath = path.join(AVATAR_DIR, 'avatar_123_1234.jpg');
  fs.writeFileSync(avatarPath, JPEG);
  createdFiles.push(avatarPath);

  const jobPath = path.join(JOB_DIR, '1700000000_kitchen_fix.jpg');
  fs.writeFileSync(jobPath, JPEG);
  createdFiles.push(jobPath);

  const verifPath = path.join(VERIF_DIR, '1700000001_nid.jpg');
  fs.writeFileSync(verifPath, JPEG);
  createdFiles.push(verifPath);
});

afterAll(() => {
  for (const f of createdFiles.splice(0)) {
    try { fs.unlinkSync(f); } catch (_) {}
  }
});

// ── tests ────────────────────────────────────────────────────────────────────
describe('avatar images — public read', () => {
  test('GET /uploads/avatars/:filename without auth returns 200', async () => {
    const res = await request(app)
      .get('/uploads/avatars/avatar_123_1234.jpg');
    expect(res.status).toBe(200);
  });

  test('GET /uploads/avatars/:filename for traversal path returns 404', async () => {
    const res = await request(app)
      .get('/uploads/avatars/..%2F..%2Fsrc%2Fmiddleware%2Fauth.js');
    expect(res.status).toBe(404);
  });

  test('GET /uploads/avatars/:filename for a missing file returns 404', async () => {
    const res = await request(app)
      .get('/uploads/avatars/avatar_999_9999.jpg');
    expect(res.status).toBe(404);
  });
});

describe('job photos — public read', () => {
  test('GET /uploads/jobs/:filename without auth returns 200', async () => {
    const res = await request(app)
      .get('/uploads/jobs/1700000000_kitchen_fix.jpg');
    expect(res.status).toBe(200);
  });

  test('GET /uploads/jobs/:filename for a missing file returns 404', async () => {
    const res = await request(app)
      .get('/uploads/jobs/999999_nonexistent.jpg');
    expect(res.status).toBe(404);
  });
});

describe('verification documents — still require authorization', () => {
  test('GET /uploads/verification/:filename without a token returns 401', async () => {
    const res = await request(app)
      .get('/uploads/verification/1700000001_nid.jpg');
    expect(res.status).toBe(401);
  });

  test('GET /uploads/verification/:filename with an invalid token returns 401', async () => {
    const badToken = jwt.sign({ userId: 999 }, 'wrong-secret');
    const res = await request(app)
      .get('/uploads/verification/1700000001_nid.jpg')
      .set('Authorization', `Bearer ${badToken}`);
    expect(res.status).toBe(401);
  });
});
