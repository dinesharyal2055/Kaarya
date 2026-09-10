const express = require('express');
const { getDb, save, usePostgres } = require('../db');
const { requireAuth } = require('../middleware/auth');
const { createNotification } = require('./notifications');
const { sendToUser } = require('../fcm');
const { validate, createReview } = require('../middleware/validate');
const { sanitize } = require('../middleware/sanitize');

const router = express.Router();

function pushNotify(userId, payload) {
  sendToUser(userId, payload).catch(() => {});
}

function reviewFromRow(row, reviewerName, reviewerAvatar, revieweeName, revieweeAvatar) {
  const isObj = typeof row === 'object' && !Array.isArray(row);
  return {
    id: String(isObj ? row.id : row[0]),
    jobId: String(isObj ? row.job_id : row[1]),
    reviewerId: String(isObj ? row.reviewer_id : row[2]),
    revieweeId: String(isObj ? row.reviewee_id : row[3]),
    rating: isObj ? row.rating : row[4],
    comment: (isObj ? row.comment : row[5]) || null,
    createdAt: isObj ? row.created_at : row[6],
    reviewerName: reviewerName || null,
    reviewerAvatar: reviewerAvatar || null,
    revieweeName: revieweeName || null,
    revieweeAvatar: revieweeAvatar || null,
  };
}

async function updateUserRating(userId) {
  const db = await getDb();
  if (usePostgres) {
    const res = await db.query(
      'SELECT AVG(rating) as avg, COUNT(*) as cnt FROM reviews WHERE reviewee_id = $1',
      [userId]
    );
    if (res.rowCount > 0 && res.rows[0].avg !== null) {
      await db.query('UPDATE users SET rating = $1, review_count = $2 WHERE id = $3', [parseFloat(res.rows[0].avg).toFixed(2), res.rows[0].cnt, userId]);
    }
  } else {
    const result = db.exec('SELECT AVG(rating) as avg, COUNT(*) as cnt FROM reviews WHERE reviewee_id = ?', [userId]);
    if (result.length > 0 && result[0].values.length > 0) {
      const avg = result[0].values[0][0];
      const cnt = result[0].values[0][1];
      if (avg !== null) db.run('UPDATE users SET rating = ?, review_count = ? WHERE id = ?', [avg.toFixed(2), cnt, userId]);
    }
    save();
  }
}

// POST /api/reviews
router.post('/', requireAuth, sanitize('comment'), validate(createReview), async (req, res) => {
  try {
    const { jobId, revieweeId, rating, comment } = res.locals.parsedBody;
    const db = await getDb();
    const reviewerId = req.userId;

    if (usePostgres) {
      const jobRes = await db.query('SELECT status, seeker_id FROM jobs WHERE id = $1', [jobId]);
      if (jobRes.rowCount === 0) return res.status(404).json({ error: 'Job not found' });
      if (jobRes.rows[0].status !== 'completed') return res.status(400).json({ error: 'Job not completed' });

      const offRes = await db.query("SELECT provider_id FROM offers WHERE job_id = $1 AND status = 'accepted'", [jobId]);
      const acceptedProviderId = offRes.rowCount > 0 ? offRes.rows[0].provider_id : null;

      if (String(jobRes.rows[0].seeker_id) !== String(reviewerId) && String(acceptedProviderId) !== String(reviewerId)) {
        return res.status(403).json({ error: 'Only participants can review' });
      }
      if (String(revieweeId) === String(reviewerId)) return res.status(400).json({ error: 'Cannot review yourself' });

      const exRes = await db.query('SELECT id FROM reviews WHERE job_id = $1 AND reviewer_id = $2', [jobId, reviewerId]);
      if (exRes.rowCount > 0) return res.status(409).json({ error: 'Already reviewed' });

      const insRes = await db.query(
        'INSERT INTO reviews (job_id, reviewer_id, reviewee_id, rating, comment) VALUES ($1, $2, $3, $4, $5) RETURNING id',
        [jobId, reviewerId, revieweeId, rating, comment || null]
      );

      await updateUserRating(revieweeId);

      const rRes = await db.query(
        'SELECT r.*, rev.name as rev_name, rvw.name as rvw_name FROM reviews r JOIN users rev ON r.reviewer_id = rev.id JOIN users rvw ON r.reviewee_id = rvw.id WHERE r.id = $1',
        [insRes.rows[0].id]
      );

      const rev = rRes.rows[0];
      createNotification(db, revieweeId, 'review_received', 'New review received ⭐', `${rev.rev_name} left you a ${rating}-star review`, { jobId, reviewId: String(rev.id) });
      pushNotify(revieweeId, { title: 'New review received ⭐', body: `${rev.rev_name} left you a ${rating}-star review`, data: { type: 'review_received', jobId, reviewId: String(rev.id) } });

      res.status(201).json(reviewFromRow(rev, rev.rev_name, null, rev.rvw_name, null));

    } else {
      // SQLite
      const jobResult = db.exec('SELECT status, seeker_id FROM jobs WHERE id = ?', [jobId]);
      if (jobResult.length === 0 || jobResult[0].values.length === 0) return res.status(404).json({ error: 'Job not found' });
      if (jobResult[0].values[0][0] !== 'completed') return res.status(400).json({ error: 'Job not completed' });

      const acceptedOffer = db.exec("SELECT provider_id FROM offers WHERE job_id = ? AND status = 'accepted'", [jobId]);
      const acceptedProviderId = acceptedOffer.length > 0 && acceptedOffer[0].values.length > 0 ? acceptedOffer[0].values[0][0] : null;

      if (String(jobResult[0].values[0][1]) !== String(reviewerId) && String(acceptedProviderId) !== String(reviewerId)) return res.status(403).json({ error: 'Only participants can review' });
      if (String(revieweeId) === String(reviewerId)) return res.status(400).json({ error: 'Cannot review yourself' });

      const existingReview = db.exec('SELECT id FROM reviews WHERE job_id = ? AND reviewer_id = ?', [jobId, reviewerId]);
      if (existingReview.length > 0 && existingReview[0].values.length > 0) return res.status(409).json({ error: 'Already reviewed' });

      db.run('INSERT INTO reviews (job_id, reviewer_id, reviewee_id, rating, comment) VALUES (?, ?, ?, ?, ?)', [jobId, reviewerId, revieweeId, rating, comment || null]);
      const newId = db.exec('SELECT last_insert_rowid()')[0].values[0][0];

      await updateUserRating(revieweeId);

      const reviewerResult = db.exec('SELECT name FROM users WHERE id = ?', [reviewerId]);
      const reviewerName = reviewerResult[0].values[0][0];
      const jobTitleResult = db.exec('SELECT title FROM jobs WHERE id = ?', [jobId]);

      createNotification(db, revieweeId, 'review_received', 'New review received ⭐', `${reviewerName} left you a ${rating}-star review`, { jobId, reviewId: String(newId) });
      pushNotify(revieweeId, { title: 'New review received ⭐', body: `${reviewerName} left you a ${rating}-star review`, data: { type: 'review_received', jobId, reviewId: String(newId) } });

      save();
      res.status(201).json({ id: newId });
    }
  } catch (err) {
    console.error('[reviews/submit]', err);
    res.status(500).json({ error: 'Failed to submit review' });
  }
});

// GET /api/reviews/user/:id
router.get('/user/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const db = await getDb();

    if (usePostgres) {
      const res = await db.query(
        `SELECT r.*, rev.name as rev_name, rvw.name as rvw_name
         FROM reviews r
         JOIN users rev ON r.reviewer_id = rev.id
         JOIN users rvw ON r.reviewee_id = rvw.id
         WHERE r.reviewee_id = $1 ORDER BY r.created_at DESC`,
        [id]
      );
      const reviews = res.rows.map(r => reviewFromRow(r, r.rev_name, null, r.rvw_name, null));

      const stats = await db.query('SELECT AVG(rating) as avg, COUNT(*) as cnt FROM reviews WHERE reviewee_id = $1', [id]);
      res.json({ reviews, rating: stats.rows[0].avg ? parseFloat(stats.rows[0].avg).toFixed(1) : null, reviewCount: parseInt(stats.rows[0].cnt, 10) });
    } else {
      // SQLite
      const result = db.exec(
        `SELECT r.id, r.job_id, r.reviewer_id, r.reviewee_id, r.rating, r.comment, r.created_at, rev.name, rvw.name
         FROM reviews r JOIN users rev ON r.reviewer_id = rev.id JOIN users rvw ON r.reviewee_id = rvw.id
         WHERE r.reviewee_id = ? ORDER BY r.created_at DESC`,
        [id]
      );
      const reviews = result.length > 0 ? result[0].values.map(row => reviewFromRow(row, row[7], null, row[8], null)) : [];
      const stats = db.exec('SELECT AVG(rating), COUNT(*) FROM reviews WHERE reviewee_id = ?', [id]);
      res.json({ reviews, rating: stats[0].values[0][0] ? parseFloat(stats[0].values[0][0]).toFixed(1) : null, reviewCount: stats[0].values[0][1] });
    }
  } catch (err) { res.status(500).json({ error: 'Failed' }); }
});

module.exports = router;
