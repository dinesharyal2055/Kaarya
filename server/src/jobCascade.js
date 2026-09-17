/**
 * Shared job deletion cascade.
 *
 * Removes a job row and every job-owned record (offers, negotiations, reviews,
 * saved bookmarks, conversations/messages, job-related notifications) plus the
 * locally stored photo files referenced by the job.
 *
 * Works against both the PostgreSQL (Neon) and SQLite (sql.js) drivers. Child
 * rows are removed in FK-safe order so neither driver trips a constraint.
 */
const fs = require('fs');
const path = require('path');
const { getDb, save, usePostgres } = require('./db');

const UPLOADS_JOBS_DIR = path.join(__dirname, 'uploads', 'jobs');

/**
 * Parse the raw photo_urls column and return the list of stored filenames.
 * Handles both Postgres object and SQLite array shapes.
 */
function photoFilesFromRow(row) {
  let raw = null;
  if (row) {
    if (typeof row === 'object' && !Array.isArray(row)) {
      raw = row.photo_urls;
    } else if (Array.isArray(row)) {
      raw = row[row.length > 1 ? 11 : 0] ?? null; // photo_urls column position
    }
  }
  let urls = [];
  if (raw) {
    try { urls = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch (_) { urls = []; }
  }
  return (Array.isArray(urls) ? urls : [])
    .map((u) => (typeof u === 'string' && u.startsWith('/uploads/jobs/') ? path.basename(u) : null))
    .filter(Boolean);
}

/**
 * Best-effort removal of local job photo files. Never throws.
 */
function removePhotoFiles(filenames) {
  for (const filename of filenames) {
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(filename)) continue; // guard path traversal
    try {
      const filePath = path.join(UPLOADS_JOBS_DIR, filename);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    } catch (_) {
      // best-effort only — ignore missing/locked files
    }
  }
}

/**
 * Delete a job and all related records.
 * @param {string|number} jobId
 */
async function deleteJobCascade(jobId) {
  const db = await getDb();

  // Capture photo files before the job row disappears
  let photoFiles = [];
  if (usePostgres) {
    const pRes = await db.query('SELECT photo_urls FROM jobs WHERE id = $1', [jobId]);
    if (pRes.rowCount > 0) photoFiles = photoFilesFromRow(pRes.rows[0]);
  } else {
    const pResult = db.exec('SELECT photo_urls FROM jobs WHERE id = ?', [jobId]);
    if (pResult.length > 0 && pResult[0].values.length > 0) {
      photoFiles = photoFilesFromRow(pResult[0].values[0]);
    }
  }

  if (usePostgres) {
    // FK-safe order (Postgres)
    await db.query(`
      DELETE FROM messages
      WHERE conversation_id IN (
        SELECT id FROM conversations WHERE job_id = $1
      )`, [jobId]);
    await db.query(`
      DELETE FROM conversation_participants
      WHERE conversation_id IN (
        SELECT id FROM conversations WHERE job_id = $1
      )`, [jobId]);
    await db.query(`
      UPDATE jobs SET conversation_id = NULL WHERE id = $1`, [jobId]);
    await db.query('DELETE FROM conversations WHERE job_id = $1', [jobId]);
    await db.query('DELETE FROM offers WHERE job_id = $1', [jobId]);
    await db.query('DELETE FROM negotiations WHERE job_id = $1', [jobId]);
    await db.query('DELETE FROM reviews WHERE job_id = $1', [jobId]);
    await db.query('DELETE FROM saved_jobs WHERE job_id = $1', [jobId]);
    await db.query(`
      DELETE FROM notifications
      WHERE data::text LIKE $1 OR data::text LIKE $2`,
      [`%"jobId":${jobId}%`, `%"jobId":"${jobId}"%`]);
    await db.query('DELETE FROM jobs WHERE id = $1', [jobId]);
  } else {
    // FK-safe order (SQLite with PRAGMA foreign_keys = ON)
    db.run(`
      DELETE FROM messages
      WHERE conversation_id IN (
        SELECT id FROM conversations WHERE job_id = ?
      )`, [jobId]);
    db.run(`
      DELETE FROM conversation_participants
      WHERE conversation_id IN (
        SELECT id FROM conversations WHERE job_id = ?
      )`, [jobId]);
    db.run('UPDATE jobs SET conversation_id = NULL WHERE id = ?', [jobId]);
    db.run('DELETE FROM conversations WHERE job_id = ?', [jobId]);
    db.run('DELETE FROM offers WHERE job_id = ?', [jobId]);
    db.run('DELETE FROM negotiations WHERE job_id = ?', [jobId]);
    db.run('DELETE FROM reviews WHERE job_id = ?', [jobId]);
    db.run('DELETE FROM saved_jobs WHERE job_id = ?', [jobId]);
    db.run('DELETE FROM notifications WHERE data LIKE ? OR data LIKE ?', [`%"jobId":${jobId}%`, `%"jobId":"${jobId}"%`]);
    db.run('DELETE FROM jobs WHERE id = ?', [jobId]);
    save();
  }

  removePhotoFiles(photoFiles);
}

module.exports = { deleteJobCascade };