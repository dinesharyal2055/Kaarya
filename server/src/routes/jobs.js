const express = require('express');
const fs = require('fs');
const path = require('path');
const { getDb } = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
const PAGE_SIZE = 20;

const VALID_STATUSES = ['open', 'assigned', 'in_progress', 'completed', 'cancelled'];

function jobFromRow(row, seekerName, seekerAvatar) {
  // row: [id, seeker_id, title, description, category, location, budget_min, budget_max, status, urgency, scheduled_date, photo_urls, created_at, updated_at]
  return {
    id: row[0],
    seekerId: row[1],
    title: row[2],
    description: row[3],
    category: row[4],
    area: row[5],           // DB: location → API: area
    budgetMin: row[6] ?? null,
    budgetMax: row[7] ?? null,
    status: row[8],
    urgency: row[9],
    scheduledDate: row[10] ?? null,
    photoUrls: row[11] ? JSON.parse(row[11]) : [],
    createdAt: row[12],
    updatedAt: row[13],
    seekerName: seekerName ?? null,
    seekerAvatar: seekerAvatar ?? null,
  };
}

// Helper: get offer count for a job
async function getOfferCount(jobId) {
  const db = await getDb();
  const result = db.exec('SELECT COUNT(*) FROM offers WHERE job_id = ?', [jobId]);
  return result.length > 0 ? result[0].values[0][0] : 0;
}

// Helper: get seeker info for a job
function getSeekerInfo(seekerId) {
  const db = require('../db')._db;
  if (!db) return { name: null, avatar: null };
  const result = db.exec(
    'SELECT name, avatar_url FROM users WHERE id = ?',
    [seekerId]
  );
  if (result.length === 0 || result[0].values.length === 0) {
    return { name: null, avatar: null };
  }
  const row = result[0].values[0];
  return { name: row[0], avatar: row[1] || null };
}

// POST /api/jobs/upload — upload a job photo (auth required)
router.post('/upload', requireAuth, async (req, res) => {
  try {
    const { image, filename } = req.body;
    if (!image || !filename) {
      return res.status(400).json({ error: 'image and filename are required' });
    }

    const base64Data = image.replace(/^data:image\/\w+;base64,/, '');
    let buffer;
    try {
      buffer = Buffer.from(base64Data, 'base64');
    } catch {
      return res.status(400).json({ error: 'Invalid base64 image data' });
    }

    if (buffer.length > 10 * 1024 * 1024) {
      return res.status(400).json({ error: 'Image too large (max 10MB)' });
    }

    const mime = req.body.mime || 'image/jpeg';
    const ext = mime === 'image/png' ? 'png' : 'jpg';
    const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
    const storedFilename = `${Date.now()}_${safeName}.${ext}`;

    const uploadsDir = path.join(__dirname, '..', 'uploads', 'jobs');
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }

    fs.writeFileSync(path.join(uploadsDir, storedFilename), buffer);
    const url = `/uploads/jobs/${storedFilename}`;
    res.json({ url, filename: storedFilename, size: buffer.length });
  } catch (err) {
    console.error('[/api/jobs/upload]', err);
    res.status(500).json({ error: 'Failed to upload image' });
  }
});

// GET /api/jobs — list with optional filters
router.get('/', async (req, res) => {
  try {
    const { category, location, status, page = 1 } = req.query;
    const offset = (Math.max(1, parseInt(page, 10)) - 1) * PAGE_SIZE;

    const db = await getDb();

    // Build WHERE clause dynamically
    const conditions = [];
    const params = [];

    if (category) {
      conditions.push('j.category = ?');
      params.push(category);
    }
    if (location) {
      conditions.push('j.location = ?');
      params.push(location);
    }
    if (status) {
      conditions.push('j.status = ?');
      params.push(status);
    }

    const whereClause = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

    // Count total
    const countResult = db.exec(
      `SELECT COUNT(*) FROM jobs j ${whereClause}`,
      params
    );
    const total = countResult.length > 0 ? countResult[0].values[0][0] : 0;

    // Fetch jobs with seeker name/avatar
    const safeOffset = Math.max(0, parseInt(offset, 10));
    const safeLimit = Math.max(1, Math.min(PAGE_SIZE, 100));
    const jobsResult = db.exec(
      `SELECT j.id, j.seeker_id, j.title, j.description, j.category, j.location,
              j.budget_min, j.budget_max, j.status, j.urgency, j.scheduled_date,
              j.photo_urls, j.created_at, j.updated_at, u.name, u.avatar_url
       FROM jobs j
       LEFT JOIN users u ON j.seeker_id = u.id
       ${whereClause}
       ORDER BY j.created_at DESC
       LIMIT ${safeLimit} OFFSET ${safeOffset}`,
      params
    );

    const jobs = [];
    if (jobsResult.length > 0) {
      for (const row of jobsResult[0].values) {
        // row: id(0), seeker_id(1), title(2), desc(3), cat(4), loc(5), bmin(6), bmax(7), status(8), urgency(9), sched(10), photo_urls(11), created(12), updated(13), u.name(14), u.avatar(15)
        const seekerName = row[14] ?? null;
        const seekerAvatar = row[15] ?? null;
        const job = jobFromRow(row, seekerName, seekerAvatar);
        // Attach offer count asynchronously
        const offerCount = await getOfferCount(job.id);
        job.offerCount = offerCount;
        jobs.push(job);
      }
    }

    res.json({ jobs, total, page: parseInt(page, 10), pageSize: PAGE_SIZE });
  } catch (err) {
    console.error('[jobs/list]', err);
    res.status(500).json({ error: 'Failed to list jobs' });
  }
});

// GET /api/jobs/:id — single job with offer count
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const db = await getDb();

    const result = db.exec(
      `SELECT j.id, j.seeker_id, j.title, j.description, j.category, j.location,
              j.budget_min, j.budget_max, j.status, j.urgency, j.scheduled_date,
              j.photo_urls, j.created_at, j.updated_at, u.name, u.avatar_url
       FROM jobs j
       LEFT JOIN users u ON j.seeker_id = u.id
       WHERE j.id = ?`,
      [id]
    );

    if (result.length === 0 || result[0].values.length === 0) {
      return res.status(404).json({ error: 'Job not found' });
    }

    const row = result[0].values[0];
    const seekerName = row[14] ?? null;
    const seekerAvatar = row[15] ?? null;
    const job = jobFromRow(row, seekerName, seekerAvatar);
    job.offerCount = await getOfferCount(id);

    // For assigned/in_progress/completed jobs, include accepted provider info
    const jobStatus = row[8];
    if (['assigned', 'in_progress', 'completed'].includes(jobStatus)) {
      const acceptedOffer = db.exec(
        `SELECT o.id, o.amount, o.message, o.status,
                p.name, p.avatar_url, p.id as pid
         FROM offers o
         JOIN users p ON o.provider_id = p.id
         WHERE o.job_id = ? AND o.status = 'accepted'`,
        [id]
      );
      if (acceptedOffer.length > 0 && acceptedOffer[0].values.length > 0) {
        const offerRow = acceptedOffer[0].values[0];
        job.acceptedOffer = {
          id: offerRow[0],
          price: offerRow[1],
          message: offerRow[2] || null,
          status: offerRow[3],
          providerName: offerRow[4],
          providerAvatar: offerRow[5] || null,
          providerId: String(offerRow[6]),
        };
      }
    }

    res.json(job);
  } catch (err) {
    console.error('[jobs/get]', err);
    res.status(500).json({ error: 'Failed to fetch job' });
  }
});

// POST /api/jobs — create job (auth required, seeker only)
router.post('/', requireAuth, async (req, res) => {
  try {
    const { title, description, category, location, address, budgetMin, budgetMax, negotiationMode, photoUrls } = req.body;

    // Check role
    const db = await getDb();
    const userResult = db.exec('SELECT role FROM users WHERE id = ?', [req.userId]);
    if (userResult.length === 0 || userResult[0].values.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    const role = userResult[0].values[0][0];
    if (role !== 'seeker') {
      return res.status(403).json({ error: 'Only seekers can post jobs' });
    }

    // Validate required fields
    if (!title || !description || !category || !location) {
      return res.status(400).json({ error: 'Missing required fields: title, description, category, location' });
    }

    db.run(
      `INSERT INTO jobs (seeker_id, title, description, category, location, budget_min, budget_max, photo_urls, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'open')`,
      [req.userId, title, description, category, location, budgetMin ?? null, budgetMax ?? null, JSON.stringify(photoUrls ?? [])]
    );

    const newId = db.exec('SELECT last_insert_rowid()')[0].values[0][0];

    const result = db.exec(
      `SELECT j.id, j.seeker_id, j.title, j.description, j.category, j.location,
              j.budget_min, j.budget_max, j.status, j.urgency, j.scheduled_date,
              j.photo_urls, j.created_at, j.updated_at, u.name, u.avatar_url
       FROM jobs j
       LEFT JOIN users u ON j.seeker_id = u.id
       WHERE j.id = ?`,
      [newId]
    );

    const row = result[0].values[0];
    // row: id(0), seeker_id(1), title(2), desc(3), cat(4), loc(5), bmin(6), bmax(7), status(8), urgency(9), sched(10), photo_urls(11), created(12), updated(13), u.name(14), u.avatar(15)
    const seekerName = row[14] ?? null;
    const seekerAvatar = row[15] ?? null;
    const job = jobFromRow(row, seekerName, seekerAvatar);
    job.offerCount = 0;

    res.status(201).json(job);
  } catch (err) {
    console.error('[jobs/create]', err);
    res.status(500).json({ error: 'Failed to create job' });
  }
});

// GET /api/jobs/ongoing — jobs where current user is participant (seeker or accepted provider)
router.get('/ongoing/list', requireAuth, async (req, res) => {
  try {
    const db = await getDb();
    const userId = req.userId;

    // As seeker: jobs they posted that are assigned/in_progress/completed
    const seekerJobs = db.exec(
      `SELECT j.id, j.seeker_id, j.title, j.description, j.category, j.location,
              j.budget_min, j.budget_max, j.status, j.urgency, j.scheduled_date,
              j.photo_urls, j.created_at, j.updated_at, u.name, u.avatar_url,
              'seeker' as role
       FROM jobs j
       LEFT JOIN users u ON j.seeker_id = u.id
       WHERE j.seeker_id = ? AND j.status IN ('assigned', 'in_progress', 'completed')
       ORDER BY j.updated_at DESC`,
      [userId]
    );

    // As provider: jobs where offer was accepted
    const providerJobs = db.exec(
      `SELECT j.id, j.seeker_id, j.title, j.description, j.category, j.location,
              j.budget_min, j.budget_max, j.status, j.urgency, j.scheduled_date,
              j.photo_urls, j.created_at, j.updated_at, seeker.name, seeker.avatar_url,
              'provider' as role, o.id as offer_id, o.amount as agreed_amount,
              seeker.name as seeker_name, seeker.id as seeker_id
       FROM offers o
       JOIN jobs j ON o.job_id = j.id
       LEFT JOIN users seeker ON j.seeker_id = seeker.id
       WHERE o.provider_id = ? AND o.status = 'accepted' AND j.status IN ('assigned', 'in_progress', 'completed')
       ORDER BY j.updated_at DESC`,
      [userId]
    );

    // Helper to map row → job object
    function mapJobRow(row, role, extra = {}) {
      // row: id(0), seeker_id(1), title(2), desc(3), cat(4), loc(5), bmin(6), bmax(7),
      //      status(8), urgency(9), sched(10), photo_urls(11), created(12), updated(13),
      //      seekerName(14), seekerAvatar(15), role(16) [, offer_id(17), agreed_amt(18)]
      return {
        id: row[0],
        seekerId: row[1],
        title: row[2],
        description: row[3],
        category: row[4],
        area: row[5],
        budgetMin: row[6] ?? null,
        budgetMax: row[7] ?? null,
        status: row[8],
        urgency: row[9],
        scheduledDate: row[10] ?? null,
        photoUrls: row[11] ? JSON.parse(row[11]) : [],
        createdAt: row[12],
        updatedAt: row[13],
        seekerName: row[14] ?? null,
        seekerAvatar: row[15] ?? null,
        userRole: role,
        ...extra,
      };
    }

    const jobs = [];

    if (seekerJobs.length > 0) {
      for (const row of seekerJobs[0].values) {
        jobs.push(mapJobRow(row, 'seeker'));
      }
    }

    if (providerJobs.length > 0) {
      for (const row of providerJobs[0].values) {
        // row: id(0), seeker_id(1), title(2), desc(3), cat(4), loc(5), bmin(6), bmax(7),
        //      status(8), urgency(9), sched(10), photo_urls(11), created(12), updated(13),
        //      seekerName(14), seekerAvatar(15), role(16), offer_id(17), agreed_amt(18)
        jobs.push(mapJobRow(
          row, 'provider',
          { offerId: row[17], agreedAmount: row[18] }
        ));
      }
    }

    res.json({ jobs });
  } catch (err) {
    console.error('[jobs/ongoing]', err);
    res.status(500).json({ error: 'Failed to fetch ongoing jobs' });
  }
});

// POST /api/jobs/:id/start — provider marks job as in_progress
router.post('/:id/start', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const db = await getDb();

    // Verify job exists and is assigned
    const jobResult = db.exec('SELECT status, seeker_id FROM jobs WHERE id = ?', [id]);
    if (jobResult.length === 0 || jobResult[0].values.length === 0) {
      return res.status(404).json({ error: 'Job not found' });
    }
    const jobStatus = jobResult[0].values[0][0];
    const jobSeekerId = jobResult[0].values[0][1];

    if (jobStatus !== 'assigned') {
      return res.status(400).json({ error: 'Job must be in assigned status to start' });
    }

    // Verify current user is the accepted provider
    const offerResult = db.exec(
      "SELECT provider_id FROM offers WHERE job_id = ? AND status = 'accepted'",
      [id]
    );
    if (offerResult.length === 0 || offerResult[0].values.length === 0) {
      return res.status(403).json({ error: 'No accepted offer found for this job' });
    }
    const acceptedProviderId = offerResult[0].values[0][0];
    if (String(acceptedProviderId) !== String(req.userId)) {
      return res.status(403).json({ error: 'Only the accepted provider can start this job' });
    }

    db.run('UPDATE jobs SET status = ?, updated_at = datetime("now") WHERE id = ?', ['in_progress', id]);

    // Notify seeker
    const { createNotification } = require('./notifications');
    createNotification(db, jobSeekerId, 'job_started',
      'Job has started',
      `Your job "${id}" has been started by the provider.`,
      { jobId: id }
    );

    require('../db').save();

    res.json({ message: 'Job started', status: 'in_progress' });
  } catch (err) {
    console.error('[jobs/start]', err);
    res.status(500).json({ error: 'Failed to start job' });
  }
});

// POST /api/jobs/:id/complete — seeker marks job as completed
router.post('/:id/complete', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const db = await getDb();

    // Verify job exists and is in_progress
    const jobResult = db.exec('SELECT status, seeker_id, title FROM jobs WHERE id = ?', [id]);
    if (jobResult.length === 0 || jobResult[0].values.length === 0) {
      return res.status(404).json({ error: 'Job not found' });
    }
    const jobStatus = jobResult[0].values[0][0];
    const jobSeekerId = jobResult[0].values[0][1];
    const jobTitle = jobResult[0].values[0][2];

    if (jobStatus !== 'in_progress') {
      return res.status(400).json({ error: 'Job must be in progress to mark as complete' });
    }

    // Verify current user is the job seeker
    if (String(jobSeekerId) !== String(req.userId)) {
      return res.status(403).json({ error: 'Only the job seeker can mark the job as complete' });
    }

    db.run('UPDATE jobs SET status = ?, updated_at = datetime("now") WHERE id = ?', ['completed', id]);

    // Notify provider
    const offerResult = db.exec(
      "SELECT provider_id FROM offers WHERE job_id = ? AND status = 'accepted'",
      [id]
    );
    if (offerResult.length > 0 && offerResult[0].values.length > 0) {
      const providerId = offerResult[0].values[0][0];
      const { createNotification } = require('./notifications');
      createNotification(db, providerId, 'job_completed',
        'Job marked as complete',
        `Your work on "${jobTitle}" has been marked as complete by the seeker. You can now leave a review.`,
        { jobId: id }
      );
    }

    require('../db').save();

    res.json({ message: 'Job completed', status: 'completed' });
  } catch (err) {
    console.error('[jobs/complete]', err);
    res.status(500).json({ error: 'Failed to complete job' });
  }
});

// PUT /api/jobs/:id/status — update status (auth required, owner only)
router.put('/:id/status', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!status) {
      return res.status(400).json({ error: 'Missing required field: status' });
    }

    if (!VALID_STATUSES.includes(status)) {
      return res.status(400).json({ error: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}` });
    }

    const db = await getDb();

    // Get current job
    const jobResult = db.exec('SELECT seeker_id FROM jobs WHERE id = ?', [id]);
    if (jobResult.length === 0 || jobResult[0].values.length === 0) {
      return res.status(404).json({ error: 'Job not found' });
    }

    const ownerId = jobResult[0].values[0][0];
    if (ownerId !== req.userId) {
      return res.status(403).json({ error: 'Only the job owner can update status' });
    }

    db.run('UPDATE jobs SET status = ?, updated_at = datetime("now") WHERE id = ?', [status, id]);

    res.json({ message: 'Job status updated', status });
  } catch (err) {
    console.error('[jobs/updateStatus]', err);
    res.status(500).json({ error: 'Failed to update job status' });
  }
});

module.exports = router;
