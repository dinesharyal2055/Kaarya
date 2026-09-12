'use strict';

/**
 * Storage abstraction for uploaded verification documents.
 *
 * Production: Cloudflare R2 (S3-compatible) — documents are stored PRIVATELY
 *            and only streamed back through this server (never made public).
 * Development: local filesystem fallback under ./uploads/verification.
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

      const file = await getVerificationImage(filename);
      if (!file) {
        return res.status(404).json({ error: 'Not found' });
      }

      res.setHeader('Content-Type', file.contentType);
      file.stream.pipe(res);
    } catch (err) {
      console.error('[/uploads/verification/:filename]', err);
      if (!res.headersSent) res.status(500).json({ error: 'Failed to load file' });
      else res.end();
    }
  };
}

module.exports = {
  createVerificationDownloadHandler,
  getVerificationImage,
  guessImageContentType,
  isR2Configured,
  isValidFilename,
  saveVerificationImage,
};