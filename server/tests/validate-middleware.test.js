/**
 * Zod v4 validation middleware — regression test.
 * Ensures a failed validation returns the ACTUAL field message from
 * result.error.issues (Zod v4), not the generic 'Invalid request body'
 * fallback that appeared when the middleware read Zod v3's .errors.
 */
const request = require('supertest');
const express = require('express');

const { validate, register } = require('../src/middleware/validate');

const app = express();
app.use(express.json());
app.post('/test', validate(register), (req, res) =>
  res.json({ ok: true, body: res.locals.parsedBody })
);

const VALID = {
  name: 'Valid Name',
  email: 'valid@kaarya.test',
  phone: '9812345678',
  password: 'secret123!',
  role: 'seeker',
};

describe('validate middleware (Zod v4)', () => {
  test('returns the specific field message, not the generic fallback', async () => {
    const res = await request(app)
      .post('/test')
      .send({ ...VALID, phone: '12345' }); // passes mobile checks, fails Nepali regex
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Phone must be a valid Nepali number (9800000000–9899999999)');
  });

  test('still reports missing required fields', async () => {
    const res = await request(app).post('/test').send({});
    expect(res.status).toBe(400);
    expect(typeof res.body.error).toBe('string');
    expect(res.body.error).not.toBe('Invalid request body');
  });

  test('valid payload passes through untouched', async () => {
    const res = await request(app).post('/test').send(VALID);
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.body).toEqual(VALID);
  });
});