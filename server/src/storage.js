'use strict';

/**
 * Storage abstraction for uploaded verification documents, avatars, and job photos.
 *
 * Production: Cloudflare R2 (S3-compatible). Verification documents are stored
 *            PRIVATELY and only streamed back through this server to the owner
 *            or an admin. Avatars and job photos are marketplace-shareable
 *            content (task cards, offers, chat) and are PUBLIC READ.
 * Development: local filesystem fallback under ./uploads/.
 *
 * Selection is driven purely by environment variables: R2 is used when ALL of
 * R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY and R2_BUCKET are set;
 * otherwise uploads go to the local disk so local testing keeps working.
 */

const fs = require('fs');
const path = require('path');

const { S3Client, PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');

const VERIFICATION_OBJECT_PREFIX = 'verification/';
const VERIFICATION_LOCAL_DIR = path.join(__dirname, 'uploads', 'verification');
const AVATAR_OBJECT_PREFIX = 'avatars/';
const AVATAR_LOCAL_DIR = path.join(__dirname, 'uploads', 'avatars');
const JOB_PHOTO_OBJECT_PREFIX = 'jobs/';
const JOB_PHOTO_LOCAL_DIR = path.join(__dirname, 'uploads', 'jobs');

// Stored filenames look like: <timestamp>_<sanitized>.<ext>
const FILENAME_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

function isR2Configured() {
  return Boolean(
    process.env.R2_ACCOUNT_ID &&
    process.env.R2_ACCESS_KEY_ID &&
    process.env.R2_SECRET_ACCESS_KEY &&
    process.env.R2_BUCKET
  );
}

console.log(`[storage] Verification storage: ${isR2Configured() ? 'R2' : 'R2 not configured'}`);
console.log(`[storage] Avatar storage: ${isR2Configured() ? 'R2' : 'local'}`);
console.log(`[storage] Job photo storage: ${isR2Configured() ? 'R2' : 'local'}`);

let s3Client = null;
function getS3Client() {
  if (!s3Client) {
    s3Client = new S3Client({
      region: 'auto',
      endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
      },
    });
  }
  return s3Client;
}

function guessImageContentType(key) {
  return /\.png$/i.test(key) ? 'image/png' : 'image/jpeg';
}

function isValidFilename(filename) {
  return (
    typeof filename === 'string' &&
    FILENAME_RE.test(filename) &&
    !filename.includes('..')
  );
}

/**
 * Detect the actual image format from magic bytes.
 * Returns 'image/jpeg' | 'image/png' | 'image/webp' | null.
 */
function sniffImageMime(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 3) return null;

  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (
    buffer.length >= PNG_SIG.length &&
    buffer.subarray(0, PNG_SIG.length).equals(PNG_SIG)
  ) {
    return 'image/png';
  }

  // WebP: 'RIFF' .... 'WEBP'
  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString('latin1') === 'RIFF' &&
    buffer.subarray(8, 12).toString('latin1') === 'WEBP'
  ) {
    return 'image/webp';
  }

  return null;
}

/**
 * Verify that uploaded bytes actually match the declared MIME type.
 * Used on upload so the client-declared MIME is never the only security
 * boundary — mismatched or non-image payloads are rejected.
 */
function validateImageContent(buffer, declaredMime) {
  const actual = sniffImageMime(buffer);
  return actual !== null && actual === declaredMime;
}

/**
 * Persist a verification document. Returns the stored filename.
 * R2 mode stores under `verification/<filename>`; local mode writes
 * `./uploads/verification/<filename>` (existing dev layout preserved).
 */
async function saveVerificationImage({ filename, buffer, contentType }) {
  if (!isValidFilename(filename)) throw new Error('Invalid verification filename');

  if (isR2Configured()) {
    await getS3Client().send(
      new PutObjectCommand({
        Bucket: process.env.R2_BUCKET,
        Key: `${VERIFICATION_OBJECT_PREFIX}${filename}`,
        Body: buffer,
        ContentType: contentType || guessImageContentType(filename),
      })
    );
    return filename;
  }

  fs.mkdirSync(VERIFICATION_LOCAL_DIR, { recursive: true });
  fs.writeFileSync(path.join(VERIFICATION_LOCAL_DIR, filename), buffer);
  return filename;
}

/**
 * Persist an avatar image. Returns the stored filename.
 * R2 mode stores under `avatars/<filename>`; local mode writes
 * `./uploads/avatars/<filename>`.
 */
async function saveAvatarImage({ filename, buffer, contentType }) {
  if (!isValidFilename(filename)) throw new Error('Invalid avatar filename');

  if (isR2Configured()) {
    await getS3Client().send(
      new PutObjectCommand({
        Bucket: process.env.R2_BUCKET,
        Key: `${AVATAR_OBJECT_PREFIX}${filename}`,
        Body: buffer,
        ContentType: contentType || guessImageContentType(filename),
      })
    );
    return filename;
  }

  fs.mkdirSync(AVATAR_LOCAL_DIR, { recursive: true });
  fs.writeFileSync(path.join(AVATAR_LOCAL_DIR, filename), buffer);
  return filename;
}

/**
 * Persist a job photo. Returns the stored filename.
 * R2 mode stores under `jobs/<filename>`; local mode writes
 * `./uploads/jobs/<filename>`.
 */
async function saveJobPhotoImage({ filename, buffer, contentType }) {
  if (!isValidFilename(filename)) throw new Error('Invalid job photo filename');

  if (isR2Configured()) {
    await getS3Client().send(
      new PutObjectCommand({
        Bucket: process.env.R2_BUCKET,
        Key: `${JOB_PHOTO_OBJECT_PREFIX}${filename}`,
        Body: buffer,
        ContentType: contentType || guessImageContentType(filename),
      })
    );
    return filename;
  }

  fs.mkdirSync(JOB_PHOTO_LOCAL_DIR, { recursive: true });
  fs.writeFileSync(path.join(JOB_PHOTO_LOCAL_DIR, filename), buffer);
  return filename;
}

/**
 * Retrieve a verification document as a stream.
 * Returns { stream, contentType } or null when the object does not exist.
 */
async function getVerificationImage(filename) {
  if (!isValidFilename(filename)) return null;

  if (isR2Configured()) {
    try {
      const result = await getS3Client().send(
        new GetObjectCommand({
          Bucket: process.env.R2_BUCKET,
          Key: `${VERIFICATION_OBJECT_PREFIX}${filename}`,
        })
      );
      return {
        stream: result.Body,
        contentType: result.ContentType || guessImageContentType(filename),
      };
    } catch (err) {
      if (err && (err.name === 'NoSuchKey' || err.$metadata?.httpStatusCode === 404)) return null;
      throw err;
    }
  }

  const filePath = path.join(VERIFICATION_LOCAL_DIR, filename);
  if (!fs.existsSync(filePath)) return null;
  return {
    stream: fs.createReadStream(filePath),
    contentType: guessImageContentType(filename),
  };
}

/**
 * Retrieve an avatar image as a stream.
 * Returns { stream, contentType } or null when the object does not exist.
 */
async function getAvatarImage(filename) {
  if (!isValidFilename(filename)) return null;

  if (isR2Configured()) {
    try {
      const result = await getS3Client().send(
        new GetObjectCommand({
          Bucket: process.env.R2_BUCKET,
          Key: `${AVATAR_OBJECT_PREFIX}${filename}`,
        })
      );
      return {
        stream: result.Body,
        contentType: result.ContentType || guessImageContentType(filename),
      };
    } catch (err) {
      if (err && (err.name === 'NoSuchKey' || err.$metadata?.httpStatusCode === 404)) return null;
      throw err;
    }
  }

  const filePath = path.join(AVATAR_LOCAL_DIR, filename);
  if (!fs.existsSync(filePath)) return null;
  return {
    stream: fs.createReadStream(filePath),
    contentType: guessImageContentType(filename),
  };
}

/**
 * Retrieve a job photo as a stream.
 * Returns { stream, contentType } or null when the object does not exist.
 */
async function getJobPhotoImage(filename) {
  if (!isValidFilename(filename)) return null;

  if (isR2Configured()) {
    try {
      const result = await getS3Client().send(
        new GetObjectCommand({
          Bucket: process.env.R2_BUCKET,
          Key: `${JOB_PHOTO_OBJECT_PREFIX}${filename}`,
        })
      );
      return {
        stream: result.Body,
        contentType: result.ContentType || guessImageContentType(filename),
      };
    } catch (err) {
      if (err && (err.name === 'NoSuchKey' || err.$metadata?.httpStatusCode === 404)) return null;
      throw err;
    }
  }

  const filePath = path.join(JOB_PHOTO_LOCAL_DIR, filename);
  if (!fs.existsSync(filePath)) return null;
  return {
    stream: fs.createReadStream(filePath),
    contentType: guessImageContentType(filename),
  };
}

/**
 * Express handler for GET /uploads/verification/:filename.
 * Keeps the existing public URL alive: proxies the PRIVATE R2 object (or local
 * file in development) with the correct content type — the bucket is never public.
 */
function createVerificationDownloadHandler() {
  return async (req, res) => {
    try {
      const filename = req.params.filename;
      if (!isValidFilename(filename)) {
        return res.status(404).json({ error: 'Not found' });
      }

      // First check if file exists (in R2 or local)
      const file = await getVerificationImage(filename);
      if (!file) {
        return res.status(404).json({ error: 'Not found' });
      }

      // Auth check - find which user owns this verification document
      const { getDb, usePostgres } = require('./db');
      const db = await getDb();

      let ownerId = null;
      if (usePostgres) {
        const result = await db.query(
          `SELECT user_id FROM verification_requests WHERE documents LIKE $1 LIMIT 1`,
          [`%${filename}%`]
        );
        if (result.rowCount > 0) ownerId = result.rows[0].user_id;
      } else {
        const result = db.exec(
          `SELECT user_id FROM verification_requests WHERE documents LIKE ? LIMIT 1`,
          [`%${filename}%`]
        );
        if (result.length > 0 && result[0].values.length > 0) ownerId = result[0].values[0][0];
      }

      // Allow access if user owns the document OR is admin
      let isAdmin = false;
      if (usePostgres) {
        const adminRes = await db.query('SELECT is_admin FROM users WHERE id = $1', [req.userId]);
        if (adminRes.rowCount > 0) isAdmin = adminRes.rows[0].is_admin === true;
      } else {
        const adminResult = db.exec('SELECT is_admin FROM users WHERE id = ?', [req.userId]);
        if (adminResult.length > 0 && adminResult[0].values.length > 0) isAdmin = adminResult[0].values[0][0] === 1;
      }

      if (!ownerId || (String(req.userId) !== String(ownerId) && !isAdmin)) {
        return res.status(403).json({ error: 'Forbidden' });
      }

      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
      res.setHeader('Content-Type', file.contentType);
      file.stream.pipe(res);
    } catch (err) {
      console.error('[/uploads/verification/:filename]', err);
      if (!res.headersSent) res.status(500).json({ error: 'Failed to load file' });
      else res.end();
    }
  };
}

/**
 * Express handler for GET /uploads/avatars/:filename.
 * Public read: avatars are marketplace-shareable content (task cards, offers,
 * chat, portfolios) and the app's <Image> consumers cannot attach an
 * Authorization header. Filenames are still validated against traversal;
 * missing files return 404.
 */
function createAvatarDownloadHandler() {
  return async (req, res) => {
    try {
      const filename = req.params.filename;
      if (!isValidFilename(filename)) {
        return res.status(404).json({ error: 'Not found' });
      }

      const file = await getAvatarImage(filename);
      if (!file) {
        return res.status(404).json({ error: 'Not found' });
      }

      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
      res.setHeader('Content-Type', file.contentType);
      file.stream.pipe(res);
    } catch (err) {
      console.error('[/uploads/avatars/:filename]', err);
      if (!res.headersSent) res.status(500).json({ error: 'Failed to load file' });
      else res.end();
    }
  };
}

/**
 * Express handler for GET /uploads/jobs/:filename.
 * Public read: job photos are intentionally visible to users browsing tasks,
 * and the app's Browse/Task-Details <Image> consumers cannot attach an
 * Authorization header. Filenames are still validated against traversal;
 * missing files return 404.
 */
function createJobPhotoDownloadHandler() {
  return async (req, res) => {
    try {
      const filename = req.params.filename;
      if (!isValidFilename(filename)) {
        return res.status(404).json({ error: 'Not found' });
      }

      const file = await getJobPhotoImage(filename);
      if (!file) {
        return res.status(404).json({ error: 'Not found' });
      }

      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
      res.setHeader('Content-Type', file.contentType);
      file.stream.pipe(res);
    } catch (err) {
      console.error('[/uploads/jobs/:filename]', err);
      if (!res.headersSent) res.status(500).json({ error: 'Failed to load file' });
      else res.end();
    }
  };
}

module.exports = {
  createVerificationDownloadHandler,
  createAvatarDownloadHandler,
  createJobPhotoDownloadHandler,
  getVerificationImage,
  getAvatarImage,
  getJobPhotoImage,
  guessImageContentType,
  isR2Configured,
  isValidFilename,
  saveVerificationImage,
  saveAvatarImage,
  saveJobPhotoImage,
  sniffImageMime,
  validateImageContent,
};