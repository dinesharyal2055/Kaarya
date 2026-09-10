const express = require('express');
const fs = require('fs');
const path = require('path');
const { getDb, save, usePostgres } = require('../db');
const { getClient } = require('../db-pg');
const { requireAuth } = require('../middleware/auth');
const { validate, createJob, updateJob, updateJobStatus } = require('../middleware/validate');
const { sanitize } = require('../middleware/sanitize');
const { sendToUser } = require('../fcm');

const router = express.Router();
const PAGE_SIZE = 20;

// Fire-and-forget push helper
function pushNotify(userId, payload) {
  sendToUser(userId, payload).catch(() => {});
}

function jobFromRow(row, seekerName, seekerAvatar) {
  // Support both object (PostgreSQL) and array (SQLite) shapes
  const isObj = typeof row === 'object' && !Array.isArray(row);

  const id = isObj ? row.id : row[0];
  const seekerId = isObj ? row.seeker_id : row[1];
  const title = isObj ? row.title : row[2];
  const description = isObj ? row.description : row[3];
  const category = isObj ? row.category : row[4];
  const area = isObj ? row.location : row[5];
  const budgetMin = isObj ? row.budget_min : row[6];
  const budgetMax = isObj ? row.budget_max : row[7];
  const status = isObj ? row.status : row[8];
  const urgency = isObj ? row.urgency : row[9];
  const scheduledDate = isObj ? row.scheduled_date : row[10];
  const photoUrlsRaw = isObj ? row.photo_urls : row[11];
  const createdAt = isObj ? row.created_at : row[12];
  const updatedAt = isObj ? row.updated_at : row[13];
  const seekerLat = isObj ? row.seeker_lat : row[14];
  const seekerLng = isObj ? row.seeker_lng : row[15];

  let photoUrls = [];
  if (photoUrlsRaw) {
    try { photoUrls = typeof photoUrlsRaw === 'string' ? JSON.parse(photoUrlsRaw) : photoUrlsRaw; } catch {}
  }

  return {
    id,
    seekerId,
    title,
    description,
    category,
    area,
    budgetMin: budgetMin ?? null,
    budgetMax: budgetMax ?? null,
    status,
    urgency,
    scheduledDate: scheduledDate ?? null,
    photoUrls,
    createdAt,
    updatedAt,
    seekerLat: seekerLat ?? null,
    seekerLng: seekerLng ?? null,
    seekerName: seekerName ?? (isObj ? row.seeker_name : null) ?? null,
    seekerAvatar: seekerAvatar ?? (isObj ? row.seeker_avatar : null) ?? null,
  };
}

async function getOfferCount(jobId) {
  const db = await getDb();
  if (usePostgres) {
    const res = await db.query('SELECT COUNT(*) as count FROM offers WHERE job_id = $1', [jobId]);
    return parseInt(res.rows[0].count, 10);
  } else {
    const result = db.exec('SELECT COUNT(*) FROM offers WHERE job_id = ?', [jobId]);
    return result.length > 0 ? result[0].values[0][0] : 0;
  }
}

// POST /api/jobs/upload — upload job photo
router.post('/upload', requireAuth, async (req, res) => {
  try {
    const { image, filename } = req.body;
    if (!image || !filename) {
      return res.status(400).json({ error: 'image and filename are required' });
    }

    const base64Data = image.replace(/^data:image\/\w+;base64,/, '');
    let buffer;
    try { buffer = Buffer.from(base64Data, 'base64'); } catch {
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
    if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

    fs.writeFileSync(path.join(uploadsDir, storedFilename), buffer);
    const url = `/uploads/jobs/${storedFilename}`;
    res.json({ url, filename: storedFilename, size: buffer.length });
  } catch (err) {
    console.error('[/api/jobs/upload]', err);
    res.status(500).json({ error: 'Failed to upload image' });
  }
});

// GET /api/jobs — list jobs with search filters
router.get('/', async (req, res) => {
  try {
    const { category, location, status, budget_min, budget_max, sort_by = 'newest', page = 1 } = req.query;
    const offset = (Math.max(1, parseInt(page, 10)) - 1) * PAGE_SIZE;
    const db = await getDb();

    if (usePostgres) {
      const conditions = [];
      const params = [];
      let pIdx = 1;

      if (category) { conditions.push(`j.category = $${pIdx++}`); params.push(category); }
      if (location) { conditions.push(`j.location = $${pIdx++}`); params.push(location); }
      if (status) { conditions.push(`j.status = $${pIdx++}`); params.push(status); }
      if (budget_min) { conditions.push(`j.budget_max >= $${pIdx++}`); params.push(parseFloat(budget_min)); }
      if (budget_max) { conditions.push(`j.budget_min <= $${pIdx++}`); params.push(parseFloat(budget_max)); }

      const whereClause = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

      const sortMap = {
        newest: 'j.created_at DESC',
        oldest: 'j.created_at ASC',
        price_low: 'j.budget_min ASC',
        price_high: 'j.budget_max DESC',
      };
      const orderClause = sortMap[sort_by] || sortMap.newest;

      const countRes = await db.query(`SELECT COUNT(*) FROM jobs j ${whereClause}`, params);
      const total = parseInt(countRes.rows[0].count, 10);

      const safeLimit = Math.max(1, Math.min(PAGE_SIZE, 100));
      const jobsRes = await db.query(
        `SELECT j.id, j.seeker_id, j.title, j.description, j.category, j.location,
                j.budget_min, j.budget_max, j.status, j.urgency, j.scheduled_date,
                j.photo_urls, j.created_at, j.updated_at, j.seeker_lat, j.seeker_lng,
                u.name as seeker_name, u.avatar_url as seeker_avatar
         FROM jobs j
         LEFT JOIN users u ON j.seeker_id = u.id
         ${whereClause}
         ORDER BY ${orderClause}
         LIMIT $${pIdx++} OFFSET $${pIdx++}`,
        [...params, safeLimit, offset]
      );

      const jobs = [];
      for (const row of jobsRes.rows) {
        const job = jobFromRow(row);
        job.offerCount = await getOfferCount(job.id);
        jobs.push(job);
      }

      res.json({ jobs, total, page: parseInt(page, 10), pageSize: PAGE_SIZE });

    } else {
      // SQLite implementation
      const conditions = [];
      const params = [];

      if (category) { conditions.push('j.category = ?'); params.push(category); }
      if (location) { conditions.push('j.location = ?'); params.push(location); }
      if (status) { conditions.push('j.status = ?'); params.push(status); }
      if (budget_min) { conditions.push('j.budget_max >= ?'); params.push(parseFloat(budget_min)); }
      if (budget_max) { conditions.push('j.budget_min <= ?'); params.push(parseFloat(budget_max)); }

      const whereClause = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

      const sortMap = {
        newest: 'j.created_at DESC',
        oldest: 'j.created_at ASC',
        price_low: 'j.budget_min ASC',
        price_high: 'j.budget_max DESC',
      };
      const orderClause = sortMap[sort_by] || sortMap.newest;

      const countResult = db.exec(`SELECT COUNT(*) FROM jobs j ${whereClause}`, params);
      const total = countResult.length > 0 ? countResult[0].values[0][0] : 0;

      const safeOffset = Math.max(0, parseInt(offset, 10));
      const safeLimit = Math.max(1, Math.min(PAGE_SIZE, 100));
      const jobsResult = db.exec(
        `SELECT j.id, j.seeker_id, j.title, j.description, j.category, j.location,
                j.budget_min, j.budget_max, j.status, j.urgency, j.scheduled_date,
                j.photo_urls, j.created_at, j.updated_at, j.seeker_lat, j.seeker_lng,
                u.name, u.avatar_url
         FROM jobs j
         LEFT JOIN users u ON j.seeker_id = u.id
         ${whereClause}
         ORDER BY ${orderClause}
         LIMIT ${safeLimit} OFFSET ${safeOffset}`,
        params
      );

      const jobs = [];
      if (jobsResult.length > 0) {
        for (const row of jobsResult[0].values) {
          const job = jobFromRow(row, row[16], row[17]);
          job.offerCount = await getOfferCount(job.id);
          jobs.push(job);
        }
      }

      res.json({ jobs, total, page: parseInt(page, 10), pageSize: PAGE_SIZE });
    }
  } catch (err) {
    console.error('[jobs/list]', err);
    res.status(500).json({ error: 'Failed to list jobs' });
  }
});

// GET /api/jobs/:id — single job
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const db = await getDb();

    if (usePostgres) {
      const resJob = await db.query(
        `SELECT j.id, j.seeker_id, j.title, j.description, j.category, j.location,
                j.budget_min, j.budget_max, j.status, j.urgency, j.scheduled_date,
                j.photo_urls, j.created_at, j.updated_at, j.seeker_lat, j.seeker_lng,
                u.name as seeker_name, u.avatar_url as seeker_avatar
         FROM jobs j
         LEFT JOIN users u ON j.seeker_id = u.id
         WHERE j.id = $1`,
        [id]
      );

      if (resJob.rowCount === 0) return res.status(404).json({ error: 'Job not found' });

      const row = resJob.rows[0];
      const job = jobFromRow(row);
      job.offerCount = await getOfferCount(id);

      if (['assigned', 'in_progress', 'completed'].includes(row.status)) {
        const acceptedOffer = await db.query(
          `SELECT o.id, o.amount, o.message, o.status,
                  p.name as provider_name, p.avatar_url as provider_avatar, p.id as pid
           FROM offers o
           JOIN users p ON o.provider_id = p.id
           WHERE o.job_id = $1 AND o.status = 'accepted'`,
          [id]
        );
        if (acceptedOffer.rowCount > 0) {
          const offerRow = acceptedOffer.rows[0];
          job.acceptedOffer = {
            id: offerRow.id,
            price: offerRow.amount,
            message: offerRow.message || null,
            status: offerRow.status,
            providerName: offerRow.provider_name,
            providerAvatar: offerRow.provider_avatar || null,
            providerId: String(offerRow.pid),
          };
          if (String(offerRow.pid) === String(req.userId)) {
            job.seekerLat = row.seeker_lat ?? null;
            job.seekerLng = row.seeker_lng ?? null;
          } else {
            job.seekerLat = null;
            job.seekerLng = null;
          }
        }
      } else {
        job.seekerLat = null;
        job.seekerLng = null;
      }

      res.json(job);

    } else {
      // SQLite implementation
      const result = db.exec(
        `SELECT j.id, j.seeker_id, j.title, j.description, j.category, j.location,
                j.budget_min, j.budget_max, j.status, j.urgency, j.scheduled_date,
                j.photo_urls, j.created_at, j.updated_at, j.seeker_lat, j.seeker_lng,
                u.name, u.avatar_url
         FROM jobs j
         LEFT JOIN users u ON j.seeker_id = u.id
         WHERE j.id = ?`,
        [id]
      );

      if (result.length === 0 || result[0].values.length === 0) {
        return res.status(404).json({ error: 'Job not found' });
      }

      const row = result[0].values[0];
      const job = jobFromRow(row, row[16], row[17]);
      job.offerCount = await getOfferCount(id);

      if (['assigned', 'in_progress', 'completed'].includes(row[8])) {
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
          if (String(offerRow[6]) === String(req.userId)) {
            job.seekerLat = row[14] ?? null;
            job.seekerLng = row[15] ?? null;
          } else {
            job.seekerLat = null;
            job.seekerLng = null;
          }
        }
      } else {
        job.seekerLat = null;
        job.seekerLng = null;
      }

      res.json(job);
    }
  } catch (err) {
    console.error('[jobs/get]', err);
    res.status(500).json({ error: 'Failed to fetch job' });
  }
});

// POST /api/jobs — create job
router.post('/', requireAuth, sanitize('title', 'description', 'location', 'address'), validate(createJob), async (req, res) => {
  try {
    const { title, description, category, location, address, budgetMin, budgetMax, negotiationMode, photoUrls, latitude, longitude } = res.locals.parsedBody;
    const db = await getDb();

    if (usePostgres) {
      const userRes = await db.query('SELECT role, is_verified FROM users WHERE id = $1', [req.userId]);
      if (userRes.rowCount === 0) return res.status(404).json({ error: 'User not found' });
      const { role, is_verified } = userRes.rows[0];

      if (role !== 'seeker') return res.status(403).json({ error: 'Only seekers can post jobs' });
      if (!is_verified) return res.status(403).json({ error: 'Only verified users can post tasks' });

      const insertRes = await db.query(
        `INSERT INTO jobs (seeker_id, title, description, category, location, budget_min, budget_max, photo_urls, status, seeker_lat, seeker_lng)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'open', $9, $10) RETURNING id`,
        [req.userId, title, description, category, location, budgetMin ?? null, budgetMax ?? null, JSON.stringify(photoUrls ?? []), latitude ?? null, longitude ?? null]
      );

      const newId = insertRes.rows[0].id;
      const jobRes = await db.query(
        `SELECT j.id, j.seeker_id, j.title, j.description, j.category, j.location,
                j.budget_min, j.budget_max, j.status, j.urgency, j.scheduled_date,
                j.photo_urls, j.created_at, j.updated_at, j.seeker_lat, j.seeker_lng,
                u.name as seeker_name, u.avatar_url as seeker_avatar
         FROM jobs j
         LEFT JOIN users u ON j.seeker_id = u.id
         WHERE j.id = $1`,
        [newId]
      );

      const job = jobFromRow(jobRes.rows[0]);
      job.offerCount = 0;
      res.status(201).json(job);

    } else {
      // SQLite implementation
      const userResult = db.exec('SELECT role, is_verified FROM users WHERE id = ?', [req.userId]);
      if (userResult.length === 0 || userResult[0].values.length === 0) return res.status(404).json({ error: 'User not found' });

      const userRow = userResult[0].values[0];
      if (userRow[0] !== 'seeker') return res.status(403).json({ error: 'Only seekers can post jobs' });
      if (userRow[1] !== 1) return res.status(403).json({ error: 'Only verified users can post tasks' });

      db.run(
        `INSERT INTO jobs (seeker_id, title, description, category, location, budget_min, budget_max, photo_urls, status, seeker_lat, seeker_lng)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, ?)`,
        [req.userId, title, description, category, location, budgetMin ?? null, budgetMax ?? null, JSON.stringify(photoUrls ?? []), latitude ?? null, longitude ?? null]
      );

      const newId = db.exec('SELECT last_insert_rowid()')[0].values[0][0];
      const result = db.exec(
        `SELECT j.id, j.seeker_id, j.title, j.description, j.category, j.location,
                j.budget_min, j.budget_max, j.status, j.urgency, j.scheduled_date,
                j.photo_urls, j.created_at, j.updated_at, j.seeker_lat, j.seeker_lng,
                u.name, u.avatar_url
         FROM jobs j
         LEFT JOIN users u ON j.seeker_id = u.id
         WHERE j.id = ?`,
        [newId]
      );

      const row = result[0].values[0];
      const job = jobFromRow(row, row[16], row[17]);
      job.offerCount = 0;
      res.status(201).json(job);
    }
  } catch (err) {
    console.error('[jobs/create]', err);
    res.status(500).json({ error: 'Failed to create job' });
  }
});

// GET /api/jobs/posted/list
router.get('/posted/list', requireAuth, async (req, res) => {
  try {
    const db = await getDb();
    if (usePostgres) {
      const resJobs = await db.query(
        `SELECT j.id, j.seeker_id, j.title, j.description, j.category, j.location,
                j.budget_min, j.budget_max, j.status, j.urgency, j.scheduled_date,
                j.photo_urls, j.created_at, j.updated_at, j.seeker_lat, j.seeker_lng,
                u.name as seeker_name, u.avatar_url as seeker_avatar
         FROM jobs j
         LEFT JOIN users u ON j.seeker_id = u.id
         WHERE j.seeker_id = $1
         ORDER BY j.created_at DESC`,
        [req.userId]
      );

      const jobs = [];
      for (const row of resJobs.rows) {
        const job = jobFromRow(row);
        job.userRole = 'seeker';
        job.offerCount = await getOfferCount(job.id);
        jobs.push(job);
      }

      res.json({ jobs });
    } else {
      const result = db.exec(
        `SELECT j.id, j.seeker_id, j.title, j.description, j.category, j.location,
                j.budget_min, j.budget_max, j.status, j.urgency, j.scheduled_date,
                j.photo_urls, j.created_at, j.updated_at, j.seeker_lat, j.seeker_lng,
                u.name, u.avatar_url
         FROM jobs j
         LEFT JOIN users u ON j.seeker_id = u.id
         WHERE j.seeker_id = ?
         ORDER BY j.created_at DESC`,
        [String(req.userId)]
      );

      const jobs = [];
      if (result.length > 0) {
        for (const row of result[0].values) {
          const job = jobFromRow(row, row[16], row[17]);
          job.userRole = 'seeker';
          job.offerCount = await getOfferCount(job.id);
          jobs.push(job);
        }
      }
      res.json({ jobs });
    }
  } catch (err) {
    console.error('[jobs/posted]', err);
    res.status(500).json({ error: 'Failed to fetch posted jobs' });
  }
});

// GET /api/jobs/ongoing/list
router.get('/ongoing/list', requireAuth, async (req, res) => {
  try {
    const db = await getDb();
    const userId = req.userId;

    if (usePostgres) {
      const seekerRes = await db.query(
        `SELECT j.id, j.seeker_id, j.title, j.description, j.category, j.location,
                j.budget_min, j.budget_max, j.status, j.urgency, j.scheduled_date,
                j.photo_urls, j.created_at, j.updated_at, j.seeker_lat, j.seeker_lng,
                u.name as seeker_name, u.avatar_url as seeker_avatar
         FROM jobs j
         LEFT JOIN users u ON j.seeker_id = u.id
         WHERE j.seeker_id = $1 AND j.status IN ('assigned', 'in_progress', 'completed')
         ORDER BY j.updated_at DESC`,
        [userId]
      );

      const providerRes = await db.query(
        `SELECT j.id, j.seeker_id, j.title, j.description, j.category, j.location,
                j.budget_min, j.budget_max, j.status, j.urgency, j.scheduled_date,
                j.photo_urls, j.created_at, j.updated_at, j.seeker_lat, j.seeker_lng,
                seeker.name as seeker_name, seeker.avatar_url as seeker_avatar,
                o.id as offer_id, o.amount as agreed_amount
         FROM offers o
         JOIN jobs j ON o.job_id = j.id
         LEFT JOIN users seeker ON j.seeker_id = seeker.id
         WHERE o.provider_id = $1 AND o.status = 'accepted' AND j.status IN ('assigned', 'in_progress', 'completed')
         ORDER BY j.updated_at DESC`,
        [userId]
      );

      const jobs = [];
      for (const row of seekerRes.rows) {
        const job = jobFromRow(row);
        job.userRole = 'seeker';
        jobs.push(job);
      }
      for (const row of providerRes.rows) {
        const job = jobFromRow(row);
        job.userRole = 'provider';
        job.offerId = row.offer_id;
        job.agreedAmount = row.agreed_amount;
        jobs.push(job);
      }

      res.json({ jobs });

    } else {
      // SQLite implementation
      const seekerJobs = db.exec(
        `SELECT j.id, j.seeker_id, j.title, j.description, j.category, j.location,
                j.budget_min, j.budget_max, j.status, j.urgency, j.scheduled_date,
                j.photo_urls, j.created_at, j.updated_at, j.seeker_lat, j.seeker_lng,
                u.name, u.avatar_url
         FROM jobs j
         LEFT JOIN users u ON j.seeker_id = u.id
         WHERE j.seeker_id = ? AND j.status IN ('assigned', 'in_progress', 'completed')
         ORDER BY j.updated_at DESC`,
        [userId]
      );

      const providerJobs = db.exec(
        `SELECT j.id, j.seeker_id, j.title, j.description, j.category, j.location,
                j.budget_min, j.budget_max, j.status, j.urgency, j.scheduled_date,
                j.photo_urls, j.created_at, j.updated_at, j.seeker_lat, j.seeker_lng,
                seeker.name, seeker.avatar_url, 'provider' as role, o.id as offer_id, o.amount as agreed_amount
         FROM offers o
         JOIN jobs j ON o.job_id = j.id
         LEFT JOIN users seeker ON j.seeker_id = seeker.id
         WHERE o.provider_id = ? AND o.status = 'accepted' AND j.status IN ('assigned', 'in_progress', 'completed')
         ORDER BY j.updated_at DESC`,
        [userId]
      );

      const jobs = [];
      if (seekerJobs.length > 0) {
        for (const row of seekerJobs[0].values) {
          const job = jobFromRow(row, row[16], row[17]);
          job.userRole = 'seeker';
          jobs.push(job);
        }
      }
      if (providerJobs.length > 0) {
        for (const row of providerJobs[0].values) {
          const job = jobFromRow(row, row[16], row[17]);
          job.userRole = 'provider';
          job.offerId = row[19];
          job.agreedAmount = row[20];
          jobs.push(job);
        }
      }
      res.json({ jobs });
    }
  } catch (err) {
    console.error('[jobs/ongoing]', err);
    res.status(500).json({ error: 'Failed to fetch ongoing jobs' });
  }
});

// POST /api/jobs/:id/start — provider marks job in_progress
router.post('/:id/start', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const db = await getDb();

    if (usePostgres) {
      const jobRes = await db.query('SELECT status, seeker_id FROM jobs WHERE id = $1', [id]);
      if (jobRes.rowCount === 0) return res.status(404).json({ error: 'Job not found' });
      const { status: jobStatus, seeker_id: jobSeekerId } = jobRes.rows[0];

      if (jobStatus !== 'assigned') return res.status(400).json({ error: 'Job must be in assigned status to start' });

      const offerRes = await db.query(
        "SELECT provider_id FROM offers WHERE job_id = $1 AND status = 'accepted'",
        [id]
      );
      if (offerRes.rowCount === 0) return res.status(403).json({ error: 'No accepted offer found for this job' });
      if (String(offerRes.rows[0].provider_id) !== String(req.userId)) {
        return res.status(403).json({ error: 'Only the accepted provider can start this job' });
      }

      await db.query('UPDATE jobs SET status = $1, updated_at = NOW() WHERE id = $2', ['in_progress', id]);

      const { createNotification } = require('./notifications');
      createNotification(db, jobSeekerId, 'job_started',
        'Job has started 🛠️',
        `Your job has been started by the provider.`,
        { jobId: id }
      );
      pushNotify(jobSeekerId, {
        title: 'Job has started 🛠️',
        body: `Your job has been started by the provider.`,
        data: { type: 'job_started', jobId: id },
      });

      res.json({ message: 'Job started', status: 'in_progress' });

    } else {
      // SQLite implementation
      const jobResult = db.exec('SELECT status, seeker_id FROM jobs WHERE id = ?', [id]);
      if (jobResult.length === 0 || jobResult[0].values.length === 0) return res.status(404).json({ error: 'Job not found' });

      const jobStatus = jobResult[0].values[0][0];
      const jobSeekerId = jobResult[0].values[0][1];

      if (jobStatus !== 'assigned') return res.status(400).json({ error: 'Job must be in assigned status to start' });

      const offerResult = db.exec(
        "SELECT provider_id FROM offers WHERE job_id = ? AND status = 'accepted'",
        [id]
      );
      if (offerResult.length === 0 || offerResult[0].values.length === 0) return res.status(403).json({ error: 'No accepted offer found for this job' });
      if (String(offerResult[0].values[0][0]) !== String(req.userId)) return res.status(403).json({ error: 'Only the accepted provider can start this job' });

      db.run('UPDATE jobs SET status = ?, updated_at = datetime("now") WHERE id = ?', ['in_progress', id]);

      const { createNotification } = require('./notifications');
      createNotification(db, jobSeekerId, 'job_started',
        'Job has started 🛠️',
        `Your job has been started by the provider.`,
        { jobId: id }
      );
      pushNotify(jobSeekerId, {
        title: 'Job has started 🛠️',
        body: `Your job has been started by the provider.`,
        data: { type: 'job_started', jobId: id },
      });

      save();
      res.json({ message: 'Job started', status: 'in_progress' });
    }
  } catch (err) {
    console.error('[jobs/start]', err);
    res.status(500).json({ error: 'Failed to start job' });
  }
});

// POST /api/jobs/:id/complete — seeker marks job completed
router.post('/:id/complete', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const db = await getDb();

    if (usePostgres) {
      const jobRes = await db.query('SELECT status, seeker_id, title FROM jobs WHERE id = $1', [id]);
      if (jobRes.rowCount === 0) return res.status(404).json({ error: 'Job not found' });
      const { status: jobStatus, seeker_id: jobSeekerId, title: jobTitle } = jobRes.rows[0];

      if (jobStatus !== 'in_progress') return res.status(400).json({ error: 'Job must be in progress to mark as complete' });
      if (String(jobSeekerId) !== String(req.userId)) return res.status(403).json({ error: 'Only the job seeker can mark the job as complete' });

      await db.query('UPDATE jobs SET status = $1, updated_at = NOW() WHERE id = $2', ['completed', id]);

      const offerRes = await db.query(
        "SELECT provider_id FROM offers WHERE job_id = $1 AND status = 'accepted'",
        [id]
      );
      if (offerRes.rowCount > 0) {
        const providerId = offerRes.rows[0].provider_id;
        const { createNotification } = require('./notifications');
        createNotification(db, providerId, 'job_completed',
          'Job marked as complete ✅',
          `Your work on "${jobTitle}" has been marked as complete. You can now leave a review.`,
          { jobId: id }
        );
        pushNotify(providerId, {
          title: 'Job marked as complete ✅',
          body: `Your work on "${jobTitle}" has been marked as complete. You can now leave a review.`,
          data: { type: 'job_completed', jobId: id },
        });
      }

      res.json({ message: 'Job completed', status: 'completed' });

    } else {
      // SQLite implementation
      const jobResult = db.exec('SELECT status, seeker_id, title FROM jobs WHERE id = ?', [id]);
      if (jobResult.length === 0 || jobResult[0].values.length === 0) return res.status(404).json({ error: 'Job not found' });

      const jobStatus = jobResult[0].values[0][0];
      const jobSeekerId = jobResult[0].values[0][1];
      const jobTitle = jobResult[0].values[0][2];

      if (jobStatus !== 'in_progress') return res.status(400).json({ error: 'Job must be in progress to mark as complete' });
      if (String(jobSeekerId) !== String(req.userId)) return res.status(403).json({ error: 'Only the job seeker can mark the job as complete' });

      db.run('UPDATE jobs SET status = ?, updated_at = datetime("now") WHERE id = ?', ['completed', id]);

      const offerResult = db.exec(
        "SELECT provider_id FROM offers WHERE job_id = ? AND status = 'accepted'",
        [id]
      );
      if (offerResult.length > 0 && offerResult[0].values.length > 0) {
        const providerId = offerResult[0].values[0][0];
        const { createNotification } = require('./notifications');
        createNotification(db, providerId, 'job_completed',
          'Job marked as complete ✅',
          `Your work on "${jobTitle}" has been marked as complete. You can now leave a review.`,
          { jobId: id }
        );
        pushNotify(providerId, {
          title: 'Job marked as complete ✅',
          body: `Your work on "${jobTitle}" has been marked as complete. You can now leave a review.`,
          data: { type: 'job_completed', jobId: id },
        });
      }

      save();
      res.json({ message: 'Job completed', status: 'completed' });
    }
  } catch (err) {
    console.error('[jobs/complete]', err);
    res.status(500).json({ error: 'Failed to complete job' });
  }
});

// PUT /api/jobs/:id/status — update status
router.put('/:id/status', requireAuth, validate(updateJobStatus), async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = res.locals.parsedBody;
    const db = await getDb();

    if (usePostgres) {
      const jobRes = await db.query('SELECT seeker_id FROM jobs WHERE id = $1', [id]);
      if (jobRes.rowCount === 0) return res.status(404).json({ error: 'Job not found' });
      if (String(jobRes.rows[0].seeker_id) !== String(req.userId)) return res.status(403).json({ error: 'Only the job owner can update status' });

      await db.query('UPDATE jobs SET status = $1, updated_at = NOW() WHERE id = $2', [status, id]);
      res.json({ message: 'Job status updated', status });
    } else {
      const jobResult = db.exec('SELECT seeker_id FROM jobs WHERE id = ?', [id]);
      if (jobResult.length === 0 || jobResult[0].values.length === 0) return res.status(404).json({ error: 'Job not found' });
      if (String(jobResult[0].values[0][0]) !== String(req.userId)) return res.status(403).json({ error: 'Only the job owner can update status' });

      db.run('UPDATE jobs SET status = ?, updated_at = datetime("now") WHERE id = ?', [status, id]);
      res.json({ message: 'Job status updated', status });
    }
  } catch (err) {
    console.error('[jobs/updateStatus]', err);
    res.status(500).json({ error: 'Failed to update job status' });
  }
});

// PATCH /api/jobs/:id — edit job
router.patch('/:id', requireAuth, sanitize('title', 'description', 'location'), validate(updateJob), async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, location, budgetMin, budgetMax, photoUrls, latitude, longitude } = res.locals.parsedBody;
    const db = await getDb();

    if (usePostgres) {
      const jobRes = await db.query('SELECT seeker_id, status FROM jobs WHERE id = $1', [id]);
      if (jobRes.rowCount === 0) return res.status(404).json({ error: 'Job not found' });
      const { seeker_id: ownerId, status: jobStatus } = jobRes.rows[0];

      if (String(ownerId) !== String(req.userId)) return res.status(403).json({ error: 'Only the job owner can edit it' });
      if (jobStatus !== 'open') return res.status(400).json({ error: 'Cannot edit a job after bids have been placed.', code: 'BID_EXISTS' });

      const offerCount = await getOfferCount(id);
      if (offerCount > 0) return res.status(400).json({ error: 'Cannot edit a job that already has bids.', code: 'BID_EXISTS' });

      const updates = [];
      const params = [];
      let pIdx = 1;

      if (title !== undefined) { updates.push(`title = $${pIdx++}`); params.push(title.trim()); }
      if (description !== undefined) { updates.push(`description = $${pIdx++}`); params.push(description.trim()); }
      if (location !== undefined) { updates.push(`location = $${pIdx++}`); params.push(location.trim()); }
      if (budgetMin !== undefined) { updates.push(`budget_min = $${pIdx++}`); params.push(budgetMin ?? null); }
      if (budgetMax !== undefined) { updates.push(`budget_max = $${pIdx++}`); params.push(budgetMax ?? null); }
      if (photoUrls !== undefined) { updates.push(`photo_urls = $${pIdx++}`); params.push(JSON.stringify(photoUrls ?? [])); }
      if (latitude !== undefined) { updates.push(`seeker_lat = $${pIdx++}`); params.push(latitude ?? null); }
      if (longitude !== undefined) { updates.push(`seeker_lng = $${pIdx++}`); params.push(longitude ?? null); }

      updates.push(`updated_at = NOW()`);
      params.push(id);

      await db.query(`UPDATE jobs SET ${updates.join(', ')} WHERE id = $${pIdx}`, params);

      const updatedRes = await db.query(
        `SELECT j.id, j.seeker_id, j.title, j.description, j.category, j.location,
                j.budget_min, j.budget_max, j.status, j.urgency, j.scheduled_date,
                j.photo_urls, j.created_at, j.updated_at, j.seeker_lat, j.seeker_lng,
                u.name as seeker_name, u.avatar_url as seeker_avatar
         FROM jobs j
         LEFT JOIN users u ON j.seeker_id = u.id
         WHERE j.id = $1`,
        [id]
      );

      const job = jobFromRow(updatedRes.rows[0]);
      job.offerCount = 0;
      res.json(job);

    } else {
      // SQLite implementation
      const jobResult = db.exec('SELECT seeker_id, status FROM jobs WHERE id = ?', [id]);
      if (jobResult.length === 0 || jobResult[0].values.length === 0) return res.status(404).json({ error: 'Job not found' });

      const ownerId = jobResult[0].values[0][0];
      const jobStatus = jobResult[0].values[0][1];

      if (String(ownerId) !== String(req.userId)) return res.status(403).json({ error: 'Only the job owner can edit it' });
      if (jobStatus !== 'open') return res.status(400).json({ error: 'Cannot edit a job after bids have been placed.', code: 'BID_EXISTS' });

      const offerCount = await getOfferCount(id);
      if (offerCount > 0) return res.status(400).json({ error: 'Cannot edit a job that already has bids.', code: 'BID_EXISTS' });

      const updates = [];
      const params = [];

      if (title !== undefined) { updates.push('title = ?'); params.push(title.trim()); }
      if (description !== undefined) { updates.push('description = ?'); params.push(description.trim()); }
      if (location !== undefined) { updates.push('location = ?'); params.push(location.trim()); }
      if (budgetMin !== undefined) { updates.push('budget_min = ?'); params.push(budgetMin ?? null); }
      if (budgetMax !== undefined) { updates.push('budget_max = ?'); params.push(budgetMax ?? null); }
      if (photoUrls !== undefined) { updates.push('photo_urls = ?'); params.push(JSON.stringify(photoUrls ?? [])); }
      if (latitude !== undefined) { updates.push('seeker_lat = ?'); params.push(latitude ?? null); }
      if (longitude !== undefined) { updates.push('seeker_lng = ?'); params.push(longitude ?? null); }

      updates.push('updated_at = datetime("now")');
      params.push(id);

      db.run(`UPDATE jobs SET ${updates.join(', ')} WHERE id = ?`, params);
      save();

      const updatedResult = db.exec(
        `SELECT j.id, j.seeker_id, j.title, j.description, j.category, j.location,
                j.budget_min, j.budget_max, j.status, j.urgency, j.scheduled_date,
                j.photo_urls, j.created_at, j.updated_at, j.seeker_lat, j.seeker_lng,
                u.name, u.avatar_url
         FROM jobs j
         LEFT JOIN users u ON j.seeker_id = u.id
         WHERE j.id = ?`,
        [id]
      );

      const row = updatedResult[0].values[0];
      const job = jobFromRow(row, row[16], row[17]);
      job.offerCount = 0;
      res.json(job);
    }
  } catch (err) {
    console.error('[jobs/edit]', err);
    res.status(500).json({ error: 'Failed to edit job' });
  }
});

// POST /api/jobs/:id/save — save/unsave job
router.post('/:id/save', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const db = await getDb();

    if (usePostgres) {
      const userRes = await db.query('SELECT role FROM users WHERE id = $1', [req.userId]);
      if (userRes.rowCount === 0) return res.status(404).json({ error: 'User not found' });

      const jobRes = await db.query('SELECT status FROM jobs WHERE id = $1', [id]);
      if (jobRes.rowCount === 0) return res.status(404).json({ error: 'Job not found' });

      const existing = await db.query(
        'SELECT id FROM saved_jobs WHERE user_id = $1 AND job_id = $2',
        [req.userId, id]
      );

      if (existing.rowCount > 0) {
        await db.query('DELETE FROM saved_jobs WHERE user_id = $1 AND job_id = $2', [req.userId, id]);
        return res.json({ saved: false, message: 'Job removed from saved list' });
      } else {
        await db.query('INSERT INTO saved_jobs (user_id, job_id) VALUES ($1, $2)', [req.userId, id]);
        return res.json({ saved: true, message: 'Job saved' });
      }

    } else {
      // SQLite implementation
      const userResult = db.exec('SELECT role FROM users WHERE id = ?', [req.userId]);
      if (userResult.length === 0 || userResult[0].values.length === 0) return res.status(404).json({ error: 'User not found' });

      const jobResult = db.exec('SELECT status FROM jobs WHERE id = ?', [id]);
      if (jobResult.length === 0 || jobResult[0].values.length === 0) return res.status(404).json({ error: 'Job not found' });

      const existing = db.exec('SELECT id FROM saved_jobs WHERE user_id = ? AND job_id = ?', [req.userId, id]);

      if (existing.length > 0 && existing[0].values.length > 0) {
        db.run('DELETE FROM saved_jobs WHERE user_id = ? AND job_id = ?', [req.userId, id]);
        save();
        return res.json({ saved: false, message: 'Job removed from saved list' });
      } else {
        db.run('INSERT INTO saved_jobs (user_id, job_id) VALUES (?, ?)', [req.userId, id]);
        save();
        return res.json({ saved: true, message: 'Job saved' });
      }
    }
  } catch (err) {
    console.error('[jobs/save]', err);
    res.status(500).json({ error: 'Failed to save job' });
  }
});

// GET /api/jobs/saved/list
router.get('/saved/list', requireAuth, async (req, res) => {
  try {
    const db = await getDb();
    if (usePostgres) {
      const result = await db.query(
        `SELECT j.id, j.seeker_id, j.title, j.description, j.category, j.location,
                j.budget_min, j.budget_max, j.status, j.urgency, j.scheduled_date,
                j.photo_urls, j.created_at, j.updated_at, j.seeker_lat, j.seeker_lng,
                u.name as seeker_name, u.avatar_url as seeker_avatar, sj.created_at as saved_at
         FROM saved_jobs sj
         JOIN jobs j ON sj.job_id = j.id
         LEFT JOIN users u ON j.seeker_id = u.id
         WHERE sj.user_id = $1
         ORDER BY sj.created_at DESC`,
        [req.userId]
      );

      const jobs = [];
      for (const row of result.rows) {
        const job = jobFromRow(row);
        job.savedAt = row.saved_at;
        job.isSaved = true;
        job.offerCount = await getOfferCount(job.id);
        jobs.push(job);
      }

      res.json({ jobs });
    } else {
      const result = db.exec(
        `SELECT j.id, j.seeker_id, j.title, j.description, j.category, j.location,
                j.budget_min, j.budget_max, j.status, j.urgency, j.scheduled_date,
                j.photo_urls, j.created_at, j.updated_at, j.seeker_lat, j.seeker_lng,
                u.name, u.avatar_url, sj.created_at as saved_at
         FROM saved_jobs sj
         JOIN jobs j ON sj.job_id = j.id
         LEFT JOIN users u ON j.seeker_id = u.id
         WHERE sj.user_id = ?
         ORDER BY sj.created_at DESC`,
        [req.userId]
      );

      const jobs = [];
      if (result.length > 0) {
        for (const row of result[0].values) {
          const job = jobFromRow(row, row[16], row[17]);
          job.savedAt = row[18];
          job.isSaved = true;
          job.offerCount = await getOfferCount(job.id);
          jobs.push(job);
        }
      }
      res.json({ jobs });
    }
  } catch (err) {
    console.error('[jobs/saved]', err);
    res.status(500).json({ error: 'Failed to fetch saved jobs' });
  }
});

// GET /api/jobs/:id/saved
router.get('/:id/saved', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const db = await getDb();

    if (usePostgres) {
      const result = await db.query('SELECT id FROM saved_jobs WHERE user_id = $1 AND job_id = $2', [req.userId, id]);
      res.json({ saved: result.rowCount > 0 });
    } else {
      const result = db.exec('SELECT id FROM saved_jobs WHERE user_id = ? AND job_id = ?', [req.userId, id]);
      res.json({ saved: result.length > 0 && result[0].values.length > 0 });
    }
  } catch (err) {
    console.error('[jobs/saved/check]', err);
    res.status(500).json({ error: 'Failed to check saved status' });
  }
});

module.exports = router;
