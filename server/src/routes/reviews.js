const express = require('express');
const { getDb, save } = require('../db');
const { requireAuth } = require('../middleware/auth');
const { createNotification } = require('./notifications');
const { sendToUser } = require('../fcm');
const { validate, createReview } = require('../middleware/validate');
const { sanitize } = require('../middleware/sanitize');

const router = express.Router();

// Fire-and-forget push helper
function pushNotify(userId, payload) {
  sendToUser(userId, payload).catch(() => {});
}

/**
 * Map a review row to API shape.
 * row: [id, job_id, reviewer_id, reviewee_id, rating, comment, created_at]
 */
function reviewFromRow(row, reviewerName, reviewerAvatar, revieweeName, revieweeAvatar) {
  return {
    id: row[0],
    jobId: row[1],
    reviewerId: String(row[2]),
    revieweeId: String(row[3]),
    rating: row[4],
    comment: row[5] || null,
    createdAt: row[6],
    reviewerName: reviewerName || null,
    reviewerAvatar: reviewerAvatar || null,
    revieweeName: revieweeName || null,
    revieweeAvatar: revieweeAvatar || null,
  };
}

// Helper: update aggregate rating on a user
async function updateUserRating(userId) {
  const db = await getDb();
  const result = db.exec(
    'SELECT AVG(rating) as avg, COUNT(*) as cnt FROM reviews WHERE reviewee_id = ?',
    [userId]
  );
  if (result.length > 0 && result[0].values.length > 0) {
    const avg = result[0].values[0][0];
    const cnt = result[0].values[0][1];
    if (avg !== null) {
      db.run('UPDATE users SET rating = ?, review_count = ? WHERE id = ?', [avg.toFixed(2), cnt, userId]);
    }
  }
}

// POST /api/reviews — submit a review
router.post('/', requireAuth, sanitize('comment'), validate(createReview), async (req, res) => {
  try {
    const { jobId, revieweeId, rating, comment } = res.locals.parsedBody;

    const db = await getDb();
    const reviewerId = req.userId;

    // Verify job exists and is completed
    const jobResult = db.exec('SELECT status, seeker_id FROM jobs WHERE id = ?', [jobId]);
    if (jobResult.length === 0 || jobResult[0].values.length === 0) {
      return res.status(404).json({ error: 'Job not found' });
    }
    const jobStatus = jobResult[0].values[0][0];
    const jobSeekerId = jobResult[0].values[0][1];
    if (jobStatus !== 'completed') {
      return res.status(400).json({ error: 'Can only review after the job is marked as completed' });
    }

    // Verify reviewer is either the seeker or the accepted provider for this job
    const acceptedOffer = db.exec(
      "SELECT provider_id FROM offers WHERE job_id = ? AND status = 'accepted'",
      [jobId]
    );
    const acceptedProviderId = acceptedOffer.length > 0 && acceptedOffer[0].values.length > 0
      ? acceptedOffer[0].values[0][0]
      : null;

    const isSeeker = String(jobSeekerId) === String(reviewerId);
    const isProvider = acceptedProviderId !== null && String(acceptedProviderId) === String(reviewerId);
    const isValidReviewer = String(revieweeId) !== String(reviewerId);

    if (!isSeeker && !isProvider) {
      return res.status(403).json({ error: 'Only participants of this job can submit a review' });
    }
    if (!isValidReviewer) {
      return res.status(400).json({ error: 'Cannot review yourself' });
    }

    // Check if already reviewed
    const existingReview = db.exec(
      'SELECT id FROM reviews WHERE job_id = ? AND reviewer_id = ?',
      [jobId, reviewerId]
    );
    if (existingReview.length > 0 && existingReview[0].values.length > 0) {
      return res.status(409).json({ error: 'You have already reviewed this job' });
    }

    db.run(
      'INSERT INTO reviews (job_id, reviewer_id, reviewee_id, rating, comment) VALUES (?, ?, ?, ?, ?)',
      [jobId, reviewerId, revieweeId, rating, comment || null]
    );
    const newId = db.exec('SELECT last_insert_rowid()')[0].values[0][0];

    await updateUserRating(revieweeId);
    save();

    // Notify reviewee
    const revieweeResult = db.exec('SELECT name FROM users WHERE id = ?', [revieweeId]);
    const reviewerResult = db.exec('SELECT name FROM users WHERE id = ?', [reviewerId]);
    const jobTitleResult = db.exec('SELECT title FROM jobs WHERE id = ?', [jobId]);
    createNotification(
      db, revieweeId, 'review_received',
      'New review received ⭐',
      `${reviewerResult[0]?.values[0]?.[0] ?? 'Someone'} left you a ${rating}-star review for "${jobTitleResult[0]?.values[0]?.[0] ?? 'a job'}"`,
      { jobId, reviewId: String(newId) }
    );
    pushNotify(revieweeId, {
      title: 'New review received ⭐',
      body: `${reviewerResult[0]?.values[0]?.[0] ?? 'Someone'} left you a ${rating}-star review`,
      data: { type: 'review_received', jobId, reviewId: String(newId) },
    });
    save();

    const newReview = db.exec('SELECT * FROM reviews WHERE id = ?', [newId]);
    const row = newReview[0].values[0];
    res.status(201).json(reviewFromRow(row, reviewerResult[0]?.values[0]?.[0] ?? null, null, revieweeResult[0]?.values[0]?.[0] ?? null, null));
  } catch (err) {
    console.error('[reviews/submit]', err);
    res.status(500).json({ error: 'Failed to submit review' });
  }
});

// GET /api/reviews/user/:id — get reviews for a user
router.get('/user/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const db = await getDb();

    const result = db.exec(
      `SELECT r.id, r.job_id, r.reviewer_id, r.reviewee_id, r.rating, r.comment, r.created_at,
              rev.name, rev.avatar_url, rvw.name, rvw.avatar_url
       FROM reviews r
       JOIN users rev ON r.reviewer_id = rev.id
       JOIN users rvw ON r.reviewee_id = rvw.id
       WHERE r.reviewee_id = ?
       ORDER BY r.created_at DESC`,
      [id]
    );

    const reviews = [];
    if (result.length > 0) {
      for (const row of result[0].values) {
        // row: id(0), job_id(1), reviewer_id(2), reviewee_id(3), rating(4), comment(5), created_at(6), reviewerName(7), reviewerAvatar(8), revieweeName(9), revieweeAvatar(10)
        reviews.push(reviewFromRow(
          [row[0], row[1], row[2], row[3], row[4], row[5], row[6]],
          row[7], row[8], row[9], row[10]
        ));
      }
    }

    // Also get aggregate stats
    const statsResult = db.exec(
      'SELECT AVG(rating), COUNT(*) FROM reviews WHERE reviewee_id = ?',
      [id]
    );
    const avgRating = statsResult.length > 0 && statsResult[0].values[0][0] !== null
      ? parseFloat(statsResult[0].values[0][0]).toFixed(1)
      : null;
    const reviewCount = statsResult.length > 0 ? statsResult[0].values[0][1] : 0;

    res.json({ reviews, rating: avgRating ? parseFloat(avgRating) : null, reviewCount });
  } catch (err) {
    console.error('[reviews/user]', err);
    res.status(500).json({ error: 'Failed to fetch reviews' });
  }
});

// GET /api/reviews/job/:id — get all reviews for a job
router.get('/job/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const db = await getDb();

    const result = db.exec(
      `SELECT r.id, r.job_id, r.reviewer_id, r.reviewee_id, r.rating, r.comment, r.created_at,
              rev.name, rev.avatar_url, rvw.name, rvw.avatar_url
       FROM reviews r
       JOIN users rev ON r.reviewer_id = rev.id
       JOIN users rvw ON r.reviewee_id = rvw.id
       WHERE r.job_id = ?
       ORDER BY r.created_at DESC`,
      [id]
    );

    const reviews = [];
    if (result.length > 0) {
      for (const row of result[0].values) {
        reviews.push(reviewFromRow(
          [row[0], row[1], row[2], row[3], row[4], row[5], row[6]],
          row[7], row[8], row[9], row[10]
        ));
      }
    }

    res.json({ reviews });
  } catch (err) {
    console.error('[reviews/job]', err);
    res.status(500).json({ error: 'Failed to fetch reviews' });
  }
});

module.exports = router;
