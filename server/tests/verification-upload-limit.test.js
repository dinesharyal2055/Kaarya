/**
 * Verification upload body limits.
 *
 * index.js mounts express.json({ limit: '12mb' }) so that the verification
 * route's own 10MB decoded-image check is the operative guard for real uploads
 * (the old 2mb parser cap rejected bodies well below that). These tests pin the
 * contract both ways:
 *
 *   1. A base64 body larger than the old 2mb cap is accepted (12mb parser limit,
 *      decoded ~3MB < 10MB route limit).
 *   2. A JSON body beyond the 12mb parser limit is rejected before the route.
 *   3. The route's 10MB decoded-image guard is still enforced (verified with a
 *      generous parser limit so the route itself is exercised).
 *
 * Runs against the local filesystem fallback (R2 vars cleared), like the rest
 * of the suite.
 */
const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');

require('dotenv').config();

const JWT_SECRET = process.env.JWT_SECRET;
const TEST_USER_ID = 612;
const TEST_USER_TOKEN = jwt.sign({ userId: TEST_USER_ID }, JWT_SECRET, { expiresIn: '1h' });

const verificationRouter = require('../src/routes/verification');

const LOCAL_DIR = path.join(__dirname, '..', 'src', 'uploads', 'verification');
const createdFiles = [];

beforeAll(() => {
  for (const k of ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET']) delete process.env[k];
});

afterEach(() => {
  for (const f of createdFiles.splice(0)) {
    try { fs.unlinkSync(f); } catch (_) {}
  }
});

describe('verification upload — JSON body limit mirrors index.js (12mb)', () => {
  const app = express();
  app.use(express.json({ limit: '12mb' }));
  app.use('/api/verification', verificationRouter);

  test('accepts a base64 image body that exceeds the old 2mb parser cap', async () => {
    const payload = Buffer.alloc(3 * 1024 * 1024, 1); // decoded ~3MB → ~4MB JSON body
    const body = `data:image/jpeg;base64,${payload.toString('base64')}`;
    const res = await request(app)
      .post('/api/verification/upload')
      .set('Authorization', `Bearer ${TEST_USER_TOKEN}`)
      .send({ image: body, filename: 'large_but_accepted.jpg', mime: 'image/jpeg' });
    expect(res.status).toBe(200);
    expect(res.body.url).toMatch(/^\/uploads\/verification\/\d+_large_but_accepted\.jpg\.jpg$/);
    expect(res.body.size).toBe(3 * 1024 * 1024);
    createdFiles.push(path.join(LOCAL_DIR, res.body.filename));
  });

  test('rejects a JSON body beyond the 12mb parser limit', async () => {
    const payload = Buffer.alloc(11 * 1024 * 1024, 1); // ~15MB base64 JSON body
    const body = `data:image/jpeg;base64,${payload.toString('base64')}`;
    const res = await request(app)
      .post('/api/verification/upload')
      .set('Authorization', `Bearer ${TEST_USER_TOKEN}`)
      .send({ image: body, filename: 'way_too_large.jpg', mime: 'image/jpeg' });
    expect(res.status).toBe(413);
    expect(res.body).not.toHaveProperty('url');
  });
});

describe('verification upload — route 10MB decoded guard (isolated from parser)', () => {
  const app = express();
  app.use(express.json({ limit: '100mb' }));
  app.use('/api/verification', verificationRouter);

  test('rejects a decoded image larger than 10MB with 400 and no stored file', async () => {
    const payload = Buffer.alloc(11 * 1024 * 1024, 1); // decoded ~11MB → rejected by route
    const body = `data:image/jpeg;base64,${payload.toString('base64')}`;
    const res = await request(app)
      .post('/api/verification/upload')
      .set('Authorization', `Bearer ${TEST_USER_TOKEN}`)
      .send({ image: body, filename: 'over_10mb.jpg', mime: 'image/jpeg' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/too large/i);
  });
});