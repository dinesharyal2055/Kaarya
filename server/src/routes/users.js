const express = require('express');
const { getDb, usePostgres } = require('../db');

const router = express.Router();

/**
 * Public portfolio views. ONLY marketplace-appropriate information is exposed —
 * never email, phone, verification documents, location, or credentials.
 * Supports both PostgreSQL (object rows) and SQLite (array rows) drivers.
 */

function userView(row, jobsCompleted, tasksPosted, rating, reviewCount) {
  const isObj = typeof row === 'object' && !Array.isArray(row);
  return {
    id: String(isObj ? row.id : row[0]),
    name: isObj ? row.name : row[1],
    role: isObj ? row.role : row[2],
    avatarUrl: (isObj ? row.avatar_url : row[3]) || null,
    bio: (isObj ? row.bio : row[4]) || null,
    verified: !!(isObj ? row.is_verified : row[5]),
    rating,
    reviewCount,
    jobsCompleted,
    tasksPosted,
  };
}

function taskView(row) {
  const isObj = typeof row === 'object' && !Array.isArray(row);
  return {
    id: String(isObj ? row.id : row[0]),
    title: isObj ? row.title : row[1],
    status: isObj ? row.status : row[2],
    createdAt: isObj ? row.created_at : row[3],
  };
}

function reviewView(row) {
  const isObj = typeof row === 'object' && !Array.isArray(row);
  return {
    id: String(isObj ? row.id : row[0]),
    jobId: String(isObj ? row.job_id : row[1]),
    jobTitle: isObj ? row.job_title : row[2],
    reviewerId: String(isObj ? row.reviewer_id : row[3]),
    reviewerName: isObj ? row.reviewer_name : row[4],
    reviewerAvatar: (isObj ? row.reviewer_avatar : row[5]) || null,
    rating: isObj ? row.rating : row[6],
    comment: (isObj ? row.comment : row[7]) || null,
    createdAt: isObj ? row.created_at : row[8],
  };
}

// GET /api/users/:id/portfolio
router.get('/:id/portfolio', async (req, res) => {
  try {
    const { id } = req.params;
    const db = await getDb();

    let userRow;
    let jobsCompleted = 0;
    let tasks = [];
    let reviews = [];

    if (usePostgres) {
      const uRes = await db.query(
        'SELECT id, name, role, avatar_url, bio, is_verified FROM users WHERE id = $1',
        [id]
      );
      if (uRes.rowCount === 0) return res.status(404).json({ error: 'User not found' });
      userRow = uRes.rows[0];

      const cRes = await db.query(
        `SELECT COUNT(DISTINCT j.id)::int AS cnt
         FROM jobs j
         JOIN offers o ON o.job_id = j.id AND o.status = 'accepted'
         WHERE o.provider_id = $1 AND j.status = 'completed'`,
        [id]
      );
      jobsCompleted = cRes.rows[0]?.cnt ?? 0;

      const tRes = await db.query(
        'SELECT id, title, status, created_at FROM jobs WHERE seeker_id = $1 ORDER BY created_at DESC',
        [id]
      );
      tasks = tRes.rows.map(taskView);

      const rRes = await db.query(
        `SELECT r.id, r.job_id, j.title AS job_title, r.reviewer_id,
                rev.name AS reviewer_name, rev.avatar_url AS reviewer_avatar,
                r.rating, r.comment, r.created_at
         FROM reviews r
         JOIN jobs j ON j.id = r.job_id AND j.status = 'completed'
         JOIN users rev ON rev.id = r.reviewer_id
         WHERE r.reviewee_id = $1
         ORDER BY r.created_at DESC`,
        [id]
      );
      reviews = rRes.rows.map(reviewView);
    } else {
      // SQLite
      const uResult = db.exec('SELECT id, name, role, avatar_url, bio, is_verified FROM users WHERE id = ?', [id]);
      if (uResult.length === 0 || uResult[0].values.length === 0) return res.status(404).json({ error: 'User not found' });
      userRow = uResult[0].values[0];

      const cResult = db.exec(
        `SELECT COUNT(DISTINCT j.id) FROM jobs j
         JOIN offers o ON o.job_id = j.id AND o.status = 'accepted'
         WHERE o.provider_id = ? AND j.status = 'completed'`,
        [id]
      );
      jobsCompleted = cResult.length > 0 && cResult[0].values.length > 0 ? (cResult[0].values[0][0] ?? 0) : 0;

      const tResult = db.exec('SELECT id, title, status, created_at FROM jobs WHERE seeker_id = ? ORDER BY created_at DESC', [id]);
      tasks = tResult.length > 0 ? tResult[0].values.map(taskView) : [];

      const rResult = db.exec(
        `SELECT r.id, r.job_id, j.title, r.reviewer_id, rev.name, rev.avatar_url, r.rating, r.comment, r.created_at
         FROM reviews r
         JOIN jobs j ON j.id = r.job_id AND j.status = 'completed'
         JOIN users rev ON rev.id = r.reviewer_id
         WHERE r.reviewee_id = ?
         ORDER BY r.created_at DESC`,
        [id]
      );
      reviews = rResult.length > 0 ? rResult[0].values.map(reviewView) : [];
    }

    const rating = reviews.length ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length : null;

    res.json({
      user: userView(
        userRow,
        jobsCompleted,
        tasks.length,
        rating != null ? parseFloat(rating.toFixed(1)) : null,
        reviews.length
      ),
      reviews,
      tasks,
    });
  } catch (err) {
    console.error('[users/portfolio]', err);
    res.status(500).json({ error: 'Failed to load portfolio' });
  }
});

module.exports = router;