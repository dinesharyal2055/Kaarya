/**
 * Verification document storage — R2 + local filesystem fallback.
 *
 * Covers the production trace:
 *   upload (POST /api/verification/upload) → stored → download
 *   (GET /uploads/verification/:filename streams the private object).
 *
 * The local fallback is exercised end-to-end with real files; the R2 branch is
 * unit-tested with the AWS S3 client mocked, so tests never hit the network.
 */
const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');

require('dotenv').config();

jest.mock('@aws-sdk/client-s3', () => {
  const { Readable } = require('stream');
  const instances = [];
  const commands = [];
  class S3Client {
    constructor(cfg) {
      instances.push(cfg);
      this.cfg = cfg;
    }
    async send(cmd) {
      commands.push({ type: cmd.type, input: cmd.input });
      if (cmd.type === 'get') {
        if (cmd.input.Key === 'verification/__missing__.jpg') {
          throw Object.assign(new Error('Key does not exist'), { name: 'NoSuchKey' });
        }
        return {
          Body: Readable.from([Buffer.from('r2-object-bytes')]),
          ContentType: 'image/jpeg',
        };
      }
      return {};
    }
  }
  class PutObjectCommand {
    constructor(input) {
      this.input = input;
      this.type = 'put';
    }
  }
  class GetObjectCommand {
    constructor(input) {
      this.input = input;
      this.type = 'get';
    }
  }
  return {
    S3Client,
    PutObjectCommand,
    GetObjectCommand,
    __instances: instances,
    __commands: commands,
  };
});

const JWT_SECRET = process.env.JWT_SECRET;
const TEST_USER_TOKEN = jwt.sign({ userId: 601 }, JWT_SECRET, { expiresIn: '1h' });

const verificationRouter = require('../src/routes/verification');
const storage = require('../src/storage');

const app = express();
app.use(express.json());
app.use('/api/verification', verificationRouter);
app.get('/uploads/verification/:filename', storage.createVerificationDownloadHandler());

const SAMPLE_JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==',
  'base64'
);
const SAMPLE_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);

function binaryParser(res, cb) {
  const chunks = [];
  res.on('data', (c) => chunks.push(c));
  res.on('end', () => cb(null, Buffer.concat(chunks)));
}

const LOCAL_DIR = path.join(__dirname, '..', 'src', 'uploads', 'verification');
const createdFiles = [];

afterEach(() => {
  for (const f of createdFiles.splice(0)) {
    try { fs.unlinkSync(f); } catch (_) {}
  }
});

describe('verification storage — local filesystem fallback', () => {
  beforeAll(() => {
    for (const k of ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET']) delete process.env[k];
    expect(storage.isR2Configured()).toBe(false);
  });

  test('upload then download returns the original bytes with the correct content type', async () => {
    const base64 = `data:image/jpeg;base64,${SAMPLE_JPEG.toString('base64')}`;
    const upRes = await request(app)
      .post('/api/verification/upload')
      .set('Authorization', `Bearer ${TEST_USER_TOKEN}`)
      .send({ image: base64, filename: 'citizenship_front.jpg', mime: 'image/jpeg' });
    expect(upRes.status).toBe(200);
    // Legacy naming: the extension is appended to the original filename,
    // so "citizenship_front.jpg" becomes "<ts>_citizenship_front.jpg.jpg".
    expect(upRes.body.url).toMatch(/^\/uploads\/verification\/\d+_citizenship_front\.jpg\.jpg$/);
    expect(upRes.body.filename).toBe(upRes.body.url.split('/').pop());

    createdFiles.push(path.join(LOCAL_DIR, upRes.body.filename));

    const dlRes = await request(app)
      .get(upRes.body.url)
      .buffer(true)
      .parse(binaryParser);
    expect(dlRes.status).toBe(200);
    expect(dlRes.headers['content-type']).toMatch(/^image\/jpeg/);
    expect(Buffer.from(dlRes.body).equals(SAMPLE_JPEG)).toBe(true);
  });

  test('png upload is served as image/png', async () => {
    const base64 = `data:image/png;base64,${SAMPLE_PNG.toString('base64')}`;
    const upRes = await request(app)
      .post('/api/verification/upload')
      .set('Authorization', `Bearer ${TEST_USER_TOKEN}`)
      .send({ image: base64, filename: 'citizenship_back.png', mime: 'image/png' });
    expect(upRes.status).toBe(200);
    createdFiles.push(path.join(LOCAL_DIR, upRes.body.filename));

    const dlRes = await request(app)
      .get(upRes.body.url)
      .buffer(true)
      .parse(binaryParser);
    expect(dlRes.status).toBe(200);
    expect(dlRes.headers['content-type']).toMatch(/^image\/png/);
    expect(Buffer.from(dlRes.body).equals(SAMPLE_PNG)).toBe(true);
  });

  test('missing files return 404', async () => {
    const res = await request(app).get('/uploads/verification/999999999_missing.png');
    expect(res.status).toBe(404);
  });

  test('traversal / invalid filenames are rejected', async () => {
    for (const bad of [
      '..%2F..%2Fpackage.json',
      '..%2F..%2F..%2Fetc%2Fpasswd',
      'a..b',
      'bad$name.jpg',
      '%2E%2E.jpg',
    ]) {
      const res = await request(app).get(`/uploads/verification/${bad}`);
      expect(res.status).toBe(404);
    }
  });
});

describe('verification storage — R2 mode (mocked S3 client)', () => {
  const R2 = {
    R2_ACCOUNT_ID: 'testaccount',
    R2_ACCESS_KEY_ID: 'test-access-key',
    R2_SECRET_ACCESS_KEY: 'test-secret-key',
    R2_BUCKET: 'kaarya-uploads',
  };
  const savedEnv = {};

  beforeAll(() => {
    for (const k of Object.keys(R2)) savedEnv[k] = process.env[k];
    Object.assign(process.env, R2);
    expect(storage.isR2Configured()).toBe(true);
  });

  afterAll(() => {
    for (const k of Object.keys(R2)) {
      if (savedEnv[k] === undefined) delete process.env[k];
      else process.env[k] = savedEnv[k];
    }
  });

  beforeEach(() => {
    const m = require('@aws-sdk/client-s3');
    m.__instances.length = 0;
    m.__commands.length = 0;
  });

  test('saveVerificationImage PUTs to R2 under verification/<filename> with content type', async () => {
    await storage.saveVerificationImage({
      filename: '111111111_citizenship_front.jpg',
      buffer: SAMPLE_JPEG,
      contentType: 'image/jpeg',
    });

    const m = require('@aws-sdk/client-s3');
    expect(m.__instances).toHaveLength(1);
    expect(m.__instances[0]).toMatchObject({
      region: 'auto',
      endpoint: 'https://testaccount.r2.cloudflarestorage.com',
      credentials: { accessKeyId: 'test-access-key', secretAccessKey: 'test-secret-key' },
    });

    expect(m.__commands).toHaveLength(1);
    expect(m.__commands[0].type).toBe('put');
    expect(m.__commands[0].input).toMatchObject({
      Bucket: 'kaarya-uploads',
      Key: 'verification/111111111_citizenship_front.jpg',
      ContentType: 'image/jpeg',
    });
    expect(Buffer.from(m.__commands[0].input.Body).equals(SAMPLE_JPEG)).toBe(true);
  });

  test('getVerificationImage streams the object with its content type', async () => {
    const file = await storage.getVerificationImage('999999999_citizenship_front.jpg');
    expect(file).not.toBeNull();
    expect(file.contentType).toBe('image/jpeg');

    const chunks = [];
    for await (const c of file.stream) chunks.push(c);
    expect(Buffer.concat(chunks).toString()).toBe('r2-object-bytes');
  });

  test('getVerificationImage returns null when R2 reports NoSuchKey', async () => {
    const file = await storage.getVerificationImage('__missing__.jpg');
    expect(file).toBeNull();
  });

  test('invalid filenames never reach R2', async () => {
    await expect(storage.getVerificationImage('../package.json')).resolves.toBeNull();
    await expect(storage.saveVerificationImage({ filename: '../hack.jpg' })).rejects.toThrow();
  });
});