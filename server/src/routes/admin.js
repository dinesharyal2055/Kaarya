/**
 * Admin routes — verification request review and user management.
 */
const express = require('express');
const { validate, reviewVerification, updateUserRole } = require('../middleware/validate');
const { requireAuth } = require('../middleware/auth');
const { requireAdmin } = require('../middleware/adminGuard');
const router = express.Router();
const { getDb, save, usePostgres } = require('../db');
const { getClient } = require('../db-pg');
const { signTokenWithJti, hashPassword, verifyPassword } = require('../middleware/auth');
const { createNotification } = require('./notifications');

// Helper function to format user response (avoid returning sensitive data)
function formatUserForAdmin(row) {
  const isObj = typeof row === 'object' && !Array.isArray(row);

  const id = isObj ? String(row.id) : String(row[0]);
  const name = isObj ? row.name : row[1];
  const email = isObj ? row.email : row[2];
  const phone = isObj ? row.phone : row[3];
  const role = isObj ? row.role : row[5];
  const avatarUrl = isObj ? row.avatar_url : row[6];
  const bio = isObj ? row.bio : row[7];
  const rating = isObj ? row.rating : row[8];
  const reviewCount = isObj ? row.review_count : row[9];
  const isVerifiedVal = isObj ? row.is_verified : row[10];
  const isActiveVal = isObj ? row.is_active : row[11];
  const fcmToken = isObj ? row.fcm_token : row[12];
  const createdAt = isObj ? row.created_at : row[13];
  const updatedAt = isObj ? row.updated_at : row[14];

  // Handle is_verified (BOOLEAN in PG, 0/1 in SQLite)
  const isVerified = usePostgres ? (isVerifiedVal === true) : (isVerifiedVal === 1);
  // Handle is_active (BOOLEAN in PG, 0/1 in SQLite)
  const isActive = usePostgres ? (isActiveVal === true) : (isActiveVal === 1);

  let verificationStatus = isVerified ? 'verified' : 'unverified';

  // If not verified, check for pending/rejected verification request
  if (!isVerified) {
    // This would require an async call, so we'll handle it in the userResponse function instead
    // For now, we'll keep it simple and let the frontend check verification status separately
  }

  return {
    id,
    name,
    email,
    phone,
    role,
    avatarUrl: avatarUrl || undefined,
    bio: bio || undefined,
    rating: rating ?? undefined,
    reviewCount: reviewCount ?? 0,
    isVerified,
    isActive,
    fcmToken: fcmToken || undefined,
    createdAt,
    updatedAt,
    verificationStatus
  };
}

// Async helper to get full user details with verification status
async function getUserDetail(userId) {
  const db = await getDb();
  if (usePostgres) {
    const res = await db.query(
      'SELECT id, name, email, phone, password_hash, role, avatar_url, bio, rating, review_count, is_verified, is_active, fcm_token, created_at, updated_at FROM users WHERE id = $1',
      [userId]
    );
    if (res.rowCount === 0) return null;

    const user = formatUserForAdmin(res.rows[0]);

    // Check verification status
    if (!user.isVerified) {
      const reqRes = await db.query(
        'SELECT id, level, document_type, documents, notes, status, admin_notes, created_at FROM verification_requests WHERE user_id = $1 ORDER BY id DESC LIMIT 1',
        [userId]
      );
      if (reqRes.rowCount > 0) {
        const req = reqRes.rows[0];
        if (req.status === 'pending') user.verificationStatus = 'pending';
        else if (req.status === 'rejected' || req.status === 'more_info_needed') user.verificationStatus = 'rejected';
        user.verificationRequest = {
          id: req.id,
          level: req.level,
          documentType: req.document_type,
          documents: typeof req.documents === 'string' ? JSON.parse(req.documents) : req.documents,
          notes: req.notes,
          status: req.status,
          adminNotes: req.admin_notes,
          createdAt: req.created_at
        };
      }
    }

    return user;
  } else {
    const result = db.exec(
      'SELECT id, name, email, phone, password_hash, role, avatar_url, bio, rating, review_count, is_verified, is_active, fcm_token, created_at, updated_at FROM users WHERE id = ?',
      [userId]
    );
    if (result.length === 0 || result[0].values.length === 0) return null;

    const user = formatUserForAdmin(result[0].values[0]);

    // Check verification status
    if (!user.isVerified) {
      const reqResult = db.exec(
        'SELECT id, level, document_type, documents, notes, status, admin_notes, created_at FROM verification_requests WHERE user_id = ? ORDER BY id DESC LIMIT 1',
        [userId]
      );
      if (reqResult.length > 0 && reqResult[0].values.length > 0) {
        const req = reqResult[0].values[0];
        if (req[5] === 'pending') user.verificationStatus = 'pending';
        else if (req[5] === 'rejected' || req[5] === 'more_info_needed') user.verificationStatus = 'rejected';
        user.verificationRequest = {
          id: req[0],
          level: req[1],
          documentType: req[2],
          documents: JSON.parse(req[3]),
          notes: req[4],
          status: req[5],
          adminNotes: req[6],
          createdAt: req[7]
        };
      }
    }

    return user;
  }
}

// POST /api/admin/login - Admin-specific login endpoint
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const db = await getDb();
    let userRow, passwordHash;

    if (usePostgres) {
      const result = await db.query(
        'SELECT id, name, email, phone, password_hash, role, avatar_url, bio, rating, review_count, is_verified, is_active, fcm_token, created_at, updated_at, is_admin FROM users WHERE email = $1',
        [email]
      );
      if (result.rowCount > 0) {
        userRow = result.rows[0];
        passwordHash = userRow.password_hash;
      }
    } else {
      const result = db.exec(
        'SELECT id, name, email, phone, password_hash, role, avatar_url, bio, rating, review_count, is_verified, is_active, fcm_token, created_at, updated_at, is_admin FROM users WHERE email = ?',
        [email]
      );
      if (result.length > 0 && result[0].values.length > 0) {
        userRow = result[0].values[0];
        passwordHash = userRow[4];
      }
    }

    if (!userRow) {
      // Don't reveal whether the email exists
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const valid = await verifyPassword(password, passwordHash);

    if (!valid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Check if user is admin
    const isAdmin = usePostgres ? userRow.is_admin : !!userRow[15]; // is_admin is the 16th selected column (index 15)
    if (!isAdmin) {
      return res.status(403).json({ error: 'Forbidden: Admin access required' });
    }

    const userId = usePostgres ? userRow.id : userRow[0];
    const { token, jti } = signTokenWithJti(userId);
    const user = formatUserForAdmin(userRow);

    res.json({ token, user });
  } catch (err) {
    console.error('[admin/login] Error:', err);
    res.status(500).json({ error: 'Login failed' });
  }
});

// GET /api/admin/dashboard - Admin dashboard statistics
router.get('/dashboard', requireAuth, requireAdmin, async (req, res) => {
  try {
    const db = await getDb();

    if (usePostgres) {
      // Get total users
      const totalUsersRes = await db.query('SELECT COUNT(*) as count FROM users');
      const totalUsers = totalUsersRes.rows[0].count;

      // Get verified users
      const verifiedUsersRes = await db.query('SELECT COUNT(*) as count FROM users WHERE is_verified = TRUE');
      const verifiedUsers = verifiedUsersRes.rows[0].count;

      // Get unverified users
      const unverifiedUsers = totalUsers - verifiedUsers;

      // Get pending verification requests
      const pendingVerificationsRes = await db.query('SELECT COUNT(*) as count FROM verification_requests WHERE status = $1', ['pending']);
      const pendingVerifications = pendingVerificationsRes.rows[0].count;

      // Get total jobs
      const totalJobsRes = await db.query('SELECT COUNT(*) as count FROM jobs');
      const totalJobs = totalJobsRes.rows[0].count;

      // Get active/ongoing jobs (status: assigned or in_progress)
      const activeJobsRes = await db.query('SELECT COUNT(*) as count FROM jobs WHERE status IN ($1, $2)', ['assigned', 'in_progress']);
      const activeJobs = activeJobsRes.rows[0].count;

      // Get completed jobs
      const completedJobsRes = await db.query('SELECT COUNT(*) as count FROM jobs WHERE status = $1', ['completed']);
      const completedJobs = completedJobsRes.rows[0].count;

      res.json({
        totalUsers,
        verifiedUsers,
        unverifiedUsers,
        pendingVerifications,
        totalJobs,
        activeJobs,
        completedJobs
      });
    } else {
      // SQLite implementation
      const totalUsers = db.exec('SELECT COUNT(*) as count FROM users')[0].values[0][0];
      const verifiedUsers = db.exec('SELECT COUNT(*) as count FROM users WHERE is_verified = 1')[0].values[0][0];
      const unverifiedUsers = totalUsers - verifiedUsers;
      const pendingVerifications = db.exec('SELECT COUNT(*) as count FROM verification_requests WHERE status = ?', ['pending'])[0].values[0][0];
      const totalJobs = db.exec('SELECT COUNT(*) as count FROM jobs')[0].values[0][0];
      const activeJobs = db.exec('SELECT COUNT(*) as count FROM jobs WHERE status IN (?, ?)', ['assigned', 'in_progress'])[0].values[0][0];
      const completedJobs = db.exec('SELECT COUNT(*) as count FROM jobs WHERE status = ?', ['completed'])[0].values[0][0];

      res.json({
        totalUsers,
        verifiedUsers,
        unverifiedUsers,
        pendingVerifications,
        totalJobs,
        activeJobs,
        completedJobs
      });
    }
  } catch (err) {
    console.error('[admin/dashboard] Error:', err);
    res.status(500).json({ error: 'Failed to fetch dashboard data' });
  }
});

// GET /api/admin/users - List users with pagination and filters
router.get('/users', requireAuth, requireAdmin, async (req, res) => {
  try {
    const db = await getDb();
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;

    // Build WHERE clause for filters
    let whereClause = '';
    const params = [];

    if (req.query.search) {
      whereClause += 'WHERE (name LIKE $' + (params.length + 1) + ' OR email LIKE $' + (params.length + 2) + ' OR phone LIKE $' + (params.length + 3) + ') ';
      const searchTerm = `%${req.query.search}%`;
      params.push(searchTerm, searchTerm, searchTerm);
    }

    if (req.query.role) {
      whereClause += (whereClause ? 'AND ' : 'WHERE ') + 'role = $' + (params.length + 1) + ' ';
      params.push(req.query.role);
    }

    if (req.query.verified !== undefined) {
      whereClause += (whereClause ? 'AND ' : 'WHERE ') + 'is_verified = $' + (params.length + 1) + ' ';
      params.push(req.query.verified === 'true' ? (usePostgres ? true : 1) : (usePostgres ? false : 0));
    }

    if (req.query.active !== undefined) {
      whereClause += (whereClause ? 'AND ' : 'WHERE ') + 'is_active = $' + (params.length + 1) + ' ';
      params.push(req.query.active === 'true' ? (usePostgres ? true : 1) : (usePostgres ? false : 0));
    }

    const query = `
      SELECT id, name, email, phone, role, avatar_url, bio, rating, review_count, is_verified, is_active, fcm_token, created_at, updated_at
      FROM users
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `;
    params.push(limit, offset);

    let result;
    if (usePostgres) {
      result = await db.query(query, params);
    } else {
      // For SQLite, we need to adapt the query slightly
      let sqliteQuery = `
        SELECT id, name, email, phone, role, avatar_url, bio, rating, review_count, is_verified, is_active, fcm_token, created_at, updated_at
        FROM users
      `;
      if (whereClause) sqliteQuery += whereClause;
      sqliteQuery += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
      result = db.exec(sqliteQuery, [...params.slice(0, -2), limit, offset]);
    }

    // Get total count for pagination
    let countQuery = 'SELECT COUNT(*) as count FROM users';
    if (whereClause) countQuery += ' ' + whereClause;

    let countResult;
    if (usePostgres) {
      countResult = await db.query(countQuery, params.slice(0, -2)); // Exclude limit and offset params
    } else {
      countResult = db.exec(countQuery, params.slice(0, -2));
    }

    const totalCount = usePostgres ? countResult.rows[0].count : countResult[0].values[0][0];

    const users = usePostgres
      ? result.rows.map(formatUserForAdmin)
      : (result.length > 0 ? result[0].values.map(formatUserForAdmin) : []);

    res.json({
      users,
      pagination: {
        page,
        limit,
        totalPages: Math.ceil(totalCount / limit),
        totalCount
      }
    });
  } catch (err) {
    console.error('[admin/users] Error:', err);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// GET /api/admin/users/:id - Get user detail
router.get('/users/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const userId = req.params.id;
    const user = await getUserDetail(userId);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Remove sensitive fields before sending to client
    const { passwordHash, ...safeUser } = user;
    res.json(safeUser);
  } catch (err) {
    console.error('[admin/users/:id] Error:', err);
    res.status(500).json({ error: 'Failed to fetch user detail' });
  }
});

// PUT /api/admin/users/:id - Update user fields
router.put('/users/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const userId = req.params.id;
    const { name, email, phone, role, bio, isVerified, isActive } = req.body;

    // Build update query dynamically
    const updates = [];
    const values = [];
    let paramIndex = 1;

    if (name !== undefined) {
      updates.push(usePostgres ? `name = $${paramIndex++}` : 'name = ?');
      values.push(name.trim());
    }

    if (email !== undefined) {
      updates.push(usePostgres ? `email = $${paramIndex++}` : 'email = ?');
      values.push(email.trim().toLowerCase());
    }

    if (phone !== undefined) {
      updates.push(usePostgres ? `phone = $${paramIndex++}` : 'phone = ?');
      values.push(phone.trim());
    }

    if (role !== undefined) {
      // Validate role
      const validRoles = ['seeker', 'provider', 'admin'];
      if (!validRoles.includes(role)) {
        return res.status(400).json({ error: 'Invalid role' });
      }
      updates.push(usePostgres ? `role = $${paramIndex++}` : 'role = ?');
      values.push(role);
    }

    if (bio !== undefined) {
      updates.push(usePostgres ? `bio = $${paramIndex++}` : 'bio = ?');
      values.push(bio?.trim() || null);
    }

    if (isVerified !== undefined) {
      updates.push(usePostgres ? `is_verified = $${paramIndex++}` : 'is_verified = ?');
      values.push(isVerified ? (usePostgres ? true : 1) : (usePostgres ? false : 0));
    }

    if (isActive !== undefined) {
      updates.push(usePostgres ? `is_active = $${paramIndex++}` : 'is_active = ?');
      values.push(isActive ? (usePostgres ? true : 1) : (usePostgres ? false : 0));
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    updates.push(usePostgres ? `updated_at = NOW()` : 'updated_at = datetime("now")');
    values.push(userId);

    const db = await getDb();
    if (usePostgres) {
      await db.query(`UPDATE users SET ${updates.join(', ')} WHERE id = $${paramIndex}`, values);
    } else {
      db.run(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, values);
      save();
    }

    const updatedUser = await getUserDetail(userId);
    if (!updatedUser) {
      return res.status(404).json({ error: 'User not found after update' });
    }

    // Remove sensitive fields
    const { passwordHash, ...safeUser } = updatedUser;
    res.json(safeUser);
  } catch (err) {
    console.error('[admin/users/:id PUT] Error:', err);
    res.status(500).json({ error: 'Failed to update user' });
  }
});

// POST /api/admin/users/:id/role - Update user role
router.post('/users/:id/role', requireAuth, requireAdmin, async (req, res) => {
  try {
    const userId = req.params.id;
    const { role } = req.body;

    if (!role) {
      return res.status(400).json({ error: 'Role is required' });
    }

    const validRoles = ['seeker', 'provider', 'admin'];
    if (!validRoles.includes(role)) {
      return res.status(400).json({ error: 'Invalid role' });
    }

    const db = await getDb();

    let userExists;
    if (usePostgres) {
      const resCheck = await db.query('SELECT id FROM users WHERE id = $1', [userId]);
      userExists = resCheck.rowCount > 0;
    } else {
      const result = db.exec('SELECT id FROM users WHERE id = ?', [userId]);
      userExists = result.length > 0 && result[0].values.length > 0;
    }

    if (!userExists) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (usePostgres) {
      await db.query('UPDATE users SET role = $1, updated_at = NOW() WHERE id = $2', [role, userId]);
    } else {
      db.run('UPDATE users SET role = ?, updated_at = datetime("now") WHERE id = ?', [role, userId]);
      save();
    }

    res.json({ message: 'Role updated successfully', newRole: role });
  } catch (err) {
    console.error('[admin/users/:id/role] Error:', err);
    res.status(500).json({ error: 'Failed to update role' });
  }
});

// DELETE /api/admin/users/:id - Block/deactivate user
router.delete('/users/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const userId = req.params.id;
    const db = await getDb();

    // First check if user exists
    let userExists;
    if (usePostgres) {
      const resCheck = await db.query('SELECT id FROM users WHERE id = $1', [userId]);
      userExists = resCheck.rowCount > 0;
    } else {
      const result = db.exec('SELECT id FROM users WHERE id = ?', [userId]);
      userExists = result.length > 0 && result[0].values.length > 0;
    }

    if (!userExists) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Soft delete/deactivate by setting is_active to false
    if (usePostgres) {
      await db.query('UPDATE users SET is_active = FALSE, updated_at = NOW() WHERE id = $1', [userId]);
    } else {
      db.run('UPDATE users SET is_active = 0, updated_at = datetime("now") WHERE id = ?', [userId]);
      save();
    }

    // Optionally, we could also revoke all user sessions by adding to blocklist
    // For now, just deactivating the account is sufficient

    res.json({ message: 'User has been deactivated successfully' });
  } catch (err) {
    console.error('[admin/users/:id DELETE] Error:', err);
    res.status(500).json({ error: 'Failed to deactivate user' });
  }
});

// GET /api/admin/jobs - List jobs for admin
router.get('/jobs', requireAuth, requireAdmin, async (req, res) => {
  try {
    const db = await getDb();
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;

    // Build WHERE clause for filters
    let whereClause = '';
    const params = [];

    if (req.query.search) {
      whereClause += 'WHERE (title LIKE $' + (params.length + 1) + ' OR description LIKE $' + (params.length + 2) + ' OR location LIKE $' + (params.length + 3) + ') ';
      const searchTerm = `%${req.query.search}%`;
      params.push(searchTerm, searchTerm, searchTerm);
    }

    if (req.query.status) {
      whereClause += (whereClause ? 'AND ' : 'WHERE ') + 'status = $' + (params.length + 1) + ' ';
      params.push(req.query.status);
    }

    if (req.query.category) {
      whereClause += (whereClause ? 'AND ' : 'WHERE ') + 'category = $' + (params.length + 1) + ' ';
      params.push(req.query.category);
    }

    const query = `
      SELECT j.*, u.name as seeker_name, u.email as seeker_email
      FROM jobs j
      JOIN users u ON j.seeker_id = u.id
      ${whereClause}
      ORDER BY j.created_at DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `;
    params.push(limit, offset);

    let result;
    if (usePostgres) {
      result = await db.query(query, params);
    } else {
      // Adapt for SQLite
      let sqliteQuery = `
        SELECT j.*, u.name as seeker_name, u.email as seeker_email
        FROM jobs j
        JOIN users u ON j.seeker_id = u.id
      `;
      if (whereClause) sqliteQuery += whereClause;
      sqliteQuery += ' ORDER BY j.created_at DESC LIMIT ? OFFSET ?';
      result = db.exec(sqliteQuery, [...params.slice(0, -2), limit, offset]);
    }

    // Get total count for pagination
    let countQuery = 'SELECT COUNT(*) as count FROM jobs j';
    if (whereClause) countQuery += ' ' + whereClause;

    let countResult;
    if (usePostgres) {
      countResult = await db.query(countQuery, params.slice(0, -2));
    } else {
      countResult = db.exec(countQuery, params.slice(0, -2));
    }

    const totalCount = usePostgres ? countResult.rows[0].count : countResult[0].values[0][0];

    const jobs = usePostgres
      ? result.rows.map(job => {
          const isObj = typeof job === 'object' && !Array.isArray(job);
          return {
            id: isObj ? job.id : job[0],
            seekerId: isObj ? job.seeker_id : job[1],
            title: isObj ? job.title : job[2],
            description: isObj ? job.description : job[3],
            category: isObj ? job.category : job[4],
            location: isObj ? job.location : job[5],
            budgetMin: isObj ? job.budget_min : job[6],
            budgetMax: isObj ? job.budget_max : job[7],
            status: isObj ? job.status : job[8],
            urgency: isObj ? job.urgency : job[9],
            scheduledDate: isObj ? job.scheduled_date : job[10],
            photoUrls: isObj ? job.photo_urls : job[11],
            seekerLat: isObj ? job.seeker_lat : job[12],
            seekerLng: isObj ? job.seeker_lng : job[13],
            createdAt: isObj ? job.created_at : job[14],
            updatedAt: isObj ? job.updated_at : job[15],
            conversationId: isObj ? job.conversation_id : job[16],
            seekerName: isObj ? job.seeker_name : job[17],
            seekerEmail: isObj ? job.seeker_email : job[18]
          };
        })
      : (result.length > 0 ? result[0].values.map(row => ({
          id: row[0],
          seekerId: row[1],
          title: row[2],
          description: row[3],
          category: row[4],
          location: row[5],
          budgetMin: row[6],
          budgetMax: row[7],
          status: row[8],
          urgency: row[9],
          scheduledDate: row[10],
          photoUrls: row[11] ? JSON.parse(row[11]) : [],
          seekerLat: row[12],
          seekerLng: row[13],
          createdAt: row[14],
          updatedAt: row[15],
          conversationId: row[16],
          seekerName: row[17],
          seekerEmail: row[18]
        })) : []);

    res.json({
      jobs,
      pagination: {
        page,
        limit,
        totalPages: Math.ceil(totalCount / limit),
        totalCount
      }
    });
  } catch (err) {
    console.error('[admin/jobs] Error:', err);
    res.status(500).json({ error: 'Failed to fetch jobs' });
  }
});

// GET /api/admin/jobs/:id - Get job detail for admin
router.get('/jobs/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const jobId = req.params.id;
    const db = await getDb();

    if (usePostgres) {
      const res = await db.query(
        `SELECT j.*, u.name as seeker_name, u.email as seeker_email,
                p.name as provider_name, p.email as provider_email
         FROM jobs j
         JOIN users u ON j.seeker_id = u.id
         LEFT JOIN offers o ON j.id = o.job_id AND o.status = $1
         LEFT JOIN users p ON o.provider_id = p.id
         WHERE j.id = $2`,
        ['accepted', jobId]
      );

      if (res.rowCount === 0) {
        return res.status(404).json({ error: 'Job not found' });
      }

      const jobRow = res.rows[0];

      // Get offers for this job
      const offersRes = await db.query(
        `SELECT o.*, u.name as provider_name, u.email as provider_email
         FROM offers o
         JOIN users u ON o.provider_id = u.id
         WHERE o.job_id = $1
         ORDER BY o.created_at ASC`,
        [jobId]
      );

      const offers = offersRes.rows.map(offer => {
        const isObj = typeof offer === 'object' && !Array.isArray(offer);
        return {
          id: isObj ? offer.id : offer[0],
          jobId: isObj ? offer.job_id : offer[1],
          providerId: isObj ? offer.provider_id : offer[2],
          amount: isObj ? offer.amount : offer[3],
          message: isObj ? offer.message : offer[4],
          status: isObj ? offer.status : offer[5],
          createdAt: isObj ? offer.created_at : offer[6],
          updatedAt: isObj ? offer.updated_at : offer[7],
          providerName: isObj ? u.name : u[1],
          providerEmail: isObj ? u.email : u[2]
        };
      });

      const job = {
        id: jobRow.id,
        seekerId: jobRow.seeker_id,
        title: jobRow.title,
        description: jobRow.description,
        category: jobRow.category,
        location: jobRow.location,
        budgetMin: jobRow.budget_min,
        budgetMax: jobRow.budget_max,
        status: jobRow.status,
        urgency: jobRow.urgency,
        scheduledDate: jobRow.scheduled_date,
        photoUrls: jobRow.photo_urls ? JSON.parse(jobRow.photo_urls) : [],
        seekerLat: jobRow.seeker_lat,
        seekerLng: jobRow.seeker_lng,
        createdAt: jobRow.created_at,
        updatedAt: jobRow.updated_at,
        conversationId: jobRow.conversation_id,
        seekerName: jobRow.seeker_name,
        seekerEmail: jobRow.seeker_email,
        providerId: jobRow.provider_id ? jobRow.provider_id : null,
        providerName: jobRow.provider_name || null,
        providerEmail: jobRow.provider_email || null,
        offers
      };

      res.json(job);
    } else {
      // SQLite implementation
      const jobResult = db.exec(
        `SELECT j.*, u.name as seeker_name, u.email as seeker_email
         FROM jobs j
         JOIN users u ON j.seeker_id = u.id
         WHERE j.id = ?`,
        [jobId]
      );

      if (jobResult.length === 0 || jobResult[0].values.length === 0) {
        return res.status(404).json({ error: 'Job not found' });
      }

      const jobRow = jobResult[0].values[0];

      // Get offers for this job
      const offersResult = db.exec(
        `SELECT o.*, u.name as provider_name, u.email as provider_email
         FROM offers o
         JOIN users u ON o.provider_id = u.id
         WHERE o.job_id = ?
         ORDER BY o.created_at ASC`,
        [jobId]
      );

      const offers = offersResult.length > 0 ? offersResult[0].values.map(offer => ({
        id: offer[0],
        jobId: offer[1],
        providerId: offer[2],
        amount: offer[3],
        message: offer[4],
        status: offer[5],
        createdAt: offer[6],
        updatedAt: offer[7],
        providerName: offer[8],
        providerEmail: offer[9]
      })) : [];

      const job = {
        id: jobRow[0],
        seekerId: jobRow[1],
        title: jobRow[2],
        description: jobRow[3],
        category: jobRow[4],
        location: jobRow[5],
        budgetMin: jobRow[6],
        budgetMax: jobRow[7],
        status: jobRow[8],
        urgency: jobRow[9],
        scheduledDate: jobRow[10],
        photoUrls: jobRow[11] ? JSON.parse(jobRow[11]) : [],
        seekerLat: jobRow[12],
        seekerLng: jobRow[13],
        createdAt: jobRow[14],
        updatedAt: jobRow[15],
        conversationId: jobRow[16],
        seekerName: jobRow[17],
        seekerEmail: jobRow[18],
        providerId: jobRow[19] || null,
        providerName: jobRow[20] || null,
        providerEmail: jobRow[21] || null,
        offers
      };

      res.json(job);
    }
  } catch (err) {
    console.error('[admin/jobs/:id] Error:', err);
    res.status(500).json({ error: 'Failed to fetch job detail' });
  }
});

// POST /api/admin/logout - Admin logout (revoke token)
router.post('/logout', requireAuth, requireAdmin, async (req, res) => {
  try {
    if (req.tokenJti && req.tokenExp) {
      const expiresAt = new Date(req.tokenExp * 1000).toISOString();
      const db = await getDb();
      if (usePostgres) {
        await db.query(
          'INSERT INTO jwt_blocklist (jti, expires_at) VALUES ($1, $2) ON CONFLICT (jti) DO NOTHING',
          [req.tokenJti, expiresAt]
        );
        // Cleanup expired entries
        await db.query('DELETE FROM jwt_blocklist WHERE expires_at < NOW()');
      } else {
        const expStr = expiresAt.toISOString().replace('T', ' ').slice(0, 19);
        db.run(
          'INSERT OR IGNORE INTO jwt_blocklist (jti, expires_at) VALUES (?, ?)',
          [req.tokenJti, expStr]
        );
        // Cleanup expired entries
        db.run('DELETE FROM jwt_blocklist WHERE expires_at < datetime("now")');
        save();
      }
    }
    res.json({ message: 'Logged out successfully' });
  } catch (err) {
    console.error('[admin/logout] Error:', err);
    res.status(500).json({ error: 'Logout failed' });
  }
});

// GET /api/admin/verifications - List verification requests for admin
router.get('/verifications', requireAuth, requireAdmin, async (req, res) => {
  try {
    const db = await getDb();
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;

    let whereClause = '';
    const params = [];

    if (req.query.status) {
      whereClause += 'WHERE vr.status = $' + (params.length + 1) + ' ';
      params.push(req.query.status);
    }

    if (req.query.search) {
      whereClause += (whereClause ? 'AND ' : 'WHERE ') + '(u.name LIKE $' + (params.length + 1) + ' OR u.email LIKE $' + (params.length + 2) + ') ';
      const searchTerm = `%${req.query.search}%`;
      params.push(searchTerm, searchTerm);
    }

    const query = `
      SELECT vr.*, u.name as user_name, u.email as user_email, u.phone as user_phone, u.role as user_role
      FROM verification_requests vr
      JOIN users u ON vr.user_id = u.id
      ${whereClause}
      ORDER BY vr.created_at DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `;
    params.push(limit, offset);

    let result;
    if (usePostgres) {
      result = await db.query(query, params);
    } else {
      let sqliteQuery = `
        SELECT vr.*, u.name as user_name, u.email as user_email, u.phone as user_phone, u.role as user_role
        FROM verification_requests vr
        JOIN users u ON vr.user_id = u.id
      `;
      if (whereClause) sqliteQuery += whereClause;
      sqliteQuery += ' ORDER BY vr.created_at DESC LIMIT ? OFFSET ?';
      result = db.exec(sqliteQuery, [...params.slice(0, -2), limit, offset]);
    }

    let countQuery = 'SELECT COUNT(*) as count FROM verification_requests vr JOIN users u ON vr.user_id = u.id';
    if (whereClause) countQuery += ' ' + whereClause;

    let countResult;
    if (usePostgres) {
      countResult = await db.query(countQuery, params.slice(0, -2));
    } else {
      countResult = db.exec(countQuery, params.slice(0, -2));
    }

    const totalCount = usePostgres ? countResult.rows[0].count : countResult[0].values[0][0];

    const verifications = usePostgres
      ? result.rows.map(v => ({
          id: v.id,
          userId: v.user_id,
          level: v.level,
          documentType: v.document_type,
          documents: typeof v.documents === 'string' ? JSON.parse(v.documents) : v.documents,
          notes: v.notes,
          status: v.status,
          adminNotes: v.admin_notes,
          createdAt: v.created_at,
          updatedAt: v.updated_at,
          userName: v.user_name,
          userEmail: v.user_email,
          userPhone: v.user_phone,
          userRole: v.user_role
        }))
      : (result.length > 0 ? result[0].values.map(v => ({
          id: v[0],
          userId: v[1],
          level: v[2],
          documentType: v[3],
          documents: JSON.parse(v[4]),
          notes: v[5],
          status: v[6],
          adminNotes: v[7],
          createdAt: v[8],
          updatedAt: v[9],
          userName: v[10],
          userEmail: v[11],
          userPhone: v[12],
          userRole: v[13]
        })) : []);

    res.json({
      requests: verifications,
      pagination: {
        page,
        limit,
        totalPages: Math.ceil(totalCount / limit),
        totalCount
      }
    });
  } catch (err) {
    console.error('[admin/verifications] Error:', err);
    res.status(500).json({ error: 'Failed to fetch verification requests' });
  }
});

// GET /api/admin/verifications/:id - Get single verification request detail
router.get('/verifications/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const verificationId = req.params.id;
    const db = await getDb();

    if (usePostgres) {
      const vRes = await db.query(
        `SELECT vr.*, u.name as user_name, u.email as user_email, u.phone as user_phone, u.role as user_role
         FROM verification_requests vr
         JOIN users u ON vr.user_id = u.id
         WHERE vr.id = $1`,
        [verificationId]
      );

      if (vRes.rowCount === 0) {
        return res.status(404).json({ error: 'Verification request not found' });
      }

      const v = vRes.rows[0];
      res.json({
        id: v.id,
        userId: v.user_id,
        level: v.level,
        documentType: v.document_type,
        documents: typeof v.documents === 'string' ? JSON.parse(v.documents) : v.documents,
        notes: v.notes,
        status: v.status,
        adminNotes: v.admin_notes,
        createdAt: v.created_at,
        updatedAt: v.updated_at,
        userName: v.user_name,
        userEmail: v.user_email,
        userPhone: v.user_phone,
        userRole: v.user_role
      });
    } else {
      const vResult = db.exec(
        `SELECT vr.*, u.name as user_name, u.email as user_email, u.phone as user_phone, u.role as user_role
         FROM verification_requests vr
         JOIN users u ON vr.user_id = u.id
         WHERE vr.id = ?`,
        [verificationId]
      );

      if (vResult.length === 0 || vResult[0].values.length === 0) {
        return res.status(404).json({ error: 'Verification request not found' });
      }

      const v = vResult[0].values[0];
      res.json({
        id: v[0],
        userId: v[1],
        level: v[2],
        documentType: v[3],
        documents: JSON.parse(v[4]),
        notes: v[5],
        status: v[6],
        adminNotes: v[7],
        createdAt: v[8],
        updatedAt: v[9],
        userName: v[10],
        userEmail: v[11],
        userPhone: v[12],
        userRole: v[13]
      });
    }
  } catch (err) {
    console.error('[admin/verifications/:id] Error:', err);
    res.status(500).json({ error: 'Failed to fetch verification request' });
  }
});

// POST /api/admin/verifications/:id/review - Review a verification request
router.post('/verifications/:id/review', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { status, adminNotes } = req.body;
    const verificationId = req.params.id;

    if (!status || !['approved', 'rejected', 'more_info_needed'].includes(status)) {
      return res.status(400).json({ error: 'Status must be approved, rejected, or more_info_needed' });
    }

    const db = await getDb();

    if (usePostgres) {
      const client = await getClient();
      try {
        await client.query('BEGIN');

        const vRes = await client.query('SELECT * FROM verification_requests WHERE id = $1', [verificationId]);
        if (vRes.rowCount === 0) {
          await client.query('ROLLBACK');
          return res.status(404).json({ error: 'Verification request not found' });
        }

        const v = vRes.rows[0];
        if (v.status !== 'pending') {
          await client.query('ROLLBACK');
          return res.status(400).json({ error: 'This request has already been reviewed' });
        }

        await client.query(
          'UPDATE verification_requests SET status = $1, admin_notes = $2, updated_at = NOW() WHERE id = $3',
          [status, adminNotes || null, verificationId]
        );

        if (status === 'approved') {
          await client.query('UPDATE users SET is_verified = TRUE, updated_at = NOW() WHERE id = $1', [v.user_id]);
        }

        await client.query('COMMIT');

        const notificationType = status === 'approved' ? 'verification_approved' : 'verification_rejected';
        const notificationTitle = status === 'approved' ? 'Verification Approved' : 'Verification Update';
        const notificationBody = status === 'approved'
          ? 'Your account has been verified!'
          : status === 'rejected'
            ? 'Your verification request was rejected'
            : 'More information needed for your verification';

        await createNotification(db, v.user_id, notificationType, notificationTitle, notificationBody, { verificationId: String(verificationId) });

        res.json({ message: 'Verification request reviewed', status });
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    } else {
      const vResult = db.exec('SELECT * FROM verification_requests WHERE id = ?', [verificationId]);
      if (vResult.length === 0 || vResult[0].values.length === 0) {
        return res.status(404).json({ error: 'Verification request not found' });
      }

      const v = vResult[0].values[0];
      if (v[6] !== 'pending') {
        return res.status(400).json({ error: 'This request has already been reviewed' });
      }

      db.run(
        'UPDATE verification_requests SET status = ?, admin_notes = ?, updated_at = datetime("now") WHERE id = ?',
        [status, adminNotes || null, verificationId]
      );

      if (status === 'approved') {
        db.run('UPDATE users SET is_verified = 1, updated_at = datetime("now") WHERE id = ?', [v[1]]);
      }

      save();

      const notificationType = status === 'approved' ? 'verification_approved' : 'verification_rejected';
      const notificationTitle = status === 'approved' ? 'Verification Approved' : 'Verification Update';
      const notificationBody = status === 'approved'
        ? 'Your account has been verified!'
        : status === 'rejected'
          ? 'Your verification request was rejected'
          : 'More information needed for your verification';

      await createNotification(db, v[1], notificationType, notificationTitle, notificationBody, { verificationId: String(verificationId) });

      res.json({ message: 'Verification request reviewed', status });
    }
  } catch (err) {
    console.error('[admin/verifications/review] Error:', err);
    res.status(500).json({ error: 'Failed to review verification request' });
  }
});

// GET /api/admin/offers - List all offers for admin
router.get('/offers', requireAuth, requireAdmin, async (req, res) => {
  try {
    const db = await getDb();
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;

    let whereClause = '';
    const params = [];

    if (req.query.status) {
      whereClause += 'WHERE o.status = $' + (params.length + 1) + ' ';
      params.push(req.query.status);
    }

    if (req.query.jobId) {
      whereClause += (whereClause ? 'AND ' : 'WHERE ') + 'o.job_id = $' + (params.length + 1) + ' ';
      params.push(req.query.jobId);
    }

    if (req.query.providerId) {
      whereClause += (whereClause ? 'AND ' : 'WHERE ') + 'o.provider_id = $' + (params.length + 1) + ' ';
      params.push(req.query.providerId);
    }

    if (req.query.search) {
      whereClause += (whereClause ? 'AND ' : 'WHERE ') + '(j.title LIKE $' + (params.length + 1) + ' OR p.name LIKE $' + (params.length + 2) + ') ';
      const searchTerm = `%${req.query.search}%`;
      params.push(searchTerm, searchTerm);
    }

    const query = `
      SELECT o.*, j.title as job_title, j.category as job_category, j.status as job_status,
             p.name as provider_name, p.email as provider_email
      FROM offers o
      JOIN jobs j ON o.job_id = j.id
      JOIN users p ON o.provider_id = p.id
      ${whereClause}
      ORDER BY o.created_at DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `;
    params.push(limit, offset);

    let result;
    if (usePostgres) {
      result = await db.query(query, params);
    } else {
      let sqliteQuery = `
        SELECT o.*, j.title as job_title, j.category as job_category, j.status as job_status,
               p.name as provider_name, p.email as provider_email
        FROM offers o
        JOIN jobs j ON o.job_id = j.id
        JOIN users p ON o.provider_id = p.id
      `;
      if (whereClause) sqliteQuery += whereClause;
      sqliteQuery += ' ORDER BY o.created_at DESC LIMIT ? OFFSET ?';
      result = db.exec(sqliteQuery, [...params.slice(0, -2), limit, offset]);
    }

    let countQuery = 'SELECT COUNT(*) as count FROM offers o JOIN jobs j ON o.job_id = j.id JOIN users p ON o.provider_id = p.id';
    if (whereClause) countQuery += ' ' + whereClause;

    let countResult;
    if (usePostgres) {
      countResult = await db.query(countQuery, params.slice(0, -2));
    } else {
      countResult = db.exec(countQuery, params.slice(0, -2));
    }

    const totalCount = usePostgres ? countResult.rows[0].count : countResult[0].values[0][0];

    const offers = usePostgres
      ? result.rows.map(o => ({
          id: o.id,
          jobId: o.job_id,
          providerId: o.provider_id,
          amount: o.amount,
          message: o.message,
          status: o.status,
          createdAt: o.created_at,
          updatedAt: o.updated_at,
          jobTitle: o.job_title,
          jobCategory: o.job_category,
          jobStatus: o.job_status,
          providerName: o.provider_name,
          providerEmail: o.provider_email
        }))
      : (result.length > 0 ? result[0].values.map(o => ({
          id: o[0],
          jobId: o[1],
          providerId: o[2],
          amount: o[3],
          message: o[4],
          status: o[5],
          createdAt: o[6],
          updatedAt: o[7],
          jobTitle: o[8],
          jobCategory: o[9],
          jobStatus: o[10],
          providerName: o[11],
          providerEmail: o[12]
        })) : []);

    res.json({
      offers,
      pagination: {
        page,
        limit,
        totalPages: Math.ceil(totalCount / limit),
        totalCount
      }
    });
  } catch (err) {
    console.error('[admin/offers] Error:', err);
    res.status(500).json({ error: 'Failed to fetch offers' });
  }
});

// GET /api/admin/offers/:id - Get offer detail for admin
router.get('/offers/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const offerId = req.params.id;
    const db = await getDb();

    if (usePostgres) {
      const oRes = await db.query(
        `SELECT o.*, j.title as job_title, j.description as job_description, j.category as job_category,
                j.location as job_location, j.budget_min, j.budget_max, j.status as job_status,
                p.name as provider_name, p.email as provider_email, p.phone as provider_phone,
                p.rating as provider_rating, p.review_count as provider_review_count, p.is_verified as provider_verified
         FROM offers o
         JOIN jobs j ON o.job_id = j.id
         JOIN users p ON o.provider_id = p.id
         WHERE o.id = $1`,
        [offerId]
      );

      if (oRes.rowCount === 0) {
        return res.status(404).json({ error: 'Offer not found' });
      }

      const o = oRes.rows[0];

      const negRes = await db.query(
        'SELECT * FROM negotiations WHERE job_id = $1 AND provider_id = $2 ORDER BY created_at ASC',
        [o.job_id, o.provider_id]
      );

      const offer = {
        id: o.id,
        jobId: o.job_id,
        providerId: o.provider_id,
        amount: o.amount,
        message: o.message,
        status: o.status,
        createdAt: o.created_at,
        updatedAt: o.updated_at,
        job: {
          id: o.job_id,
          title: o.job_title,
          description: o.job_description,
          category: o.job_category,
          location: o.job_location,
          budgetMin: o.budget_min,
          budgetMax: o.budget_max,
          status: o.job_status
        },
        provider: {
          id: o.provider_id,
          name: o.provider_name,
          email: o.provider_email,
          phone: o.provider_phone,
          rating: o.provider_rating,
          reviewCount: o.provider_review_count,
          isVerified: o.provider_verified
        },
        negotiations: negRes.rows.map(n => ({
          id: n.id,
          proposedAmount: n.proposed_amount,
          status: n.status,
          createdAt: n.created_at,
          updatedAt: n.updated_at
        }))
      };

      res.json(offer);
    } else {
      const oResult = db.exec(
        `SELECT o.*, j.title as job_title, j.description as job_description, j.category as job_category,
                j.location as job_location, j.budget_min, j.budget_max, j.status as job_status,
                p.name as provider_name, p.email as provider_email, p.phone as provider_phone,
                p.rating as provider_rating, p.review_count as provider_review_count, p.is_verified as provider_verified
         FROM offers o
         JOIN jobs j ON o.job_id = j.id
         JOIN users p ON o.provider_id = p.id
         WHERE o.id = ?`,
        [offerId]
      );

      if (oResult.length === 0 || oResult[0].values.length === 0) {
        return res.status(404).json({ error: 'Offer not found' });
      }

      const o = oResult[0].values[0];

      const negResult = db.exec(
        'SELECT * FROM negotiations WHERE job_id = ? AND provider_id = ? ORDER BY created_at ASC',
        [o[1], o[2]]
      );

      const offer = {
        id: o[0],
        jobId: o[1],
        providerId: o[2],
        amount: o[3],
        message: o[4],
        status: o[5],
        createdAt: o[6],
        updatedAt: o[7],
        job: {
          id: o[1],
          title: o[8],
          description: o[9],
          category: o[10],
          location: o[11],
          budgetMin: o[12],
          budgetMax: o[13],
          status: o[14]
        },
        provider: {
          id: o[2],
          name: o[15],
          email: o[16],
          phone: o[17],
          rating: o[18],
          reviewCount: o[19],
          isVerified: o[20]
        },
        negotiations: negResult.length > 0 ? negResult[0].values.map(n => ({
          id: n[0],
          proposedAmount: n[4],
          status: n[5],
          createdAt: n[6],
          updatedAt: n[7]
        })) : []
      };

      res.json(offer);
    }
  } catch (err) {
    console.error('[admin/offers/:id] Error:', err);
    res.status(500).json({ error: 'Failed to fetch offer detail' });
  }
});

// GET /api/admin/reviews - List all reviews for admin
router.get('/reviews', requireAuth, requireAdmin, async (req, res) => {
  try {
    const db = await getDb();
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;

    let whereClause = '';
    const params = [];

    if (req.query.rating) {
      whereClause += 'WHERE r.rating = $' + (params.length + 1) + ' ';
      params.push(parseInt(req.query.rating));
    }

    if (req.query.search) {
      whereClause += (whereClause ? 'AND ' : 'WHERE ') + '(rev.name LIKE $' + (params.length + 1) + ' OR rvw.name LIKE $' + (params.length + 2) + ') ';
      const searchTerm = `%${req.query.search}%`;
      params.push(searchTerm, searchTerm);
    }

    const query = `
      SELECT r.*, rev.name as reviewer_name, rev.email as reviewer_email,
             rvw.name as reviewee_name, rvw.email as reviewee_email,
             j.title as job_title
      FROM reviews r
      JOIN users rev ON r.reviewer_id = rev.id
      JOIN users rvw ON r.reviewee_id = rvw.id
      JOIN jobs j ON r.job_id = j.id
      ${whereClause}
      ORDER BY r.created_at DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `;
    params.push(limit, offset);

    let result;
    if (usePostgres) {
      result = await db.query(query, params);
    } else {
      let sqliteQuery = `
        SELECT r.*, rev.name as reviewer_name, rev.email as reviewer_email,
               rvw.name as reviewee_name, rvw.email as reviewee_email,
               j.title as job_title
        FROM reviews r
        JOIN users rev ON r.reviewer_id = rev.id
        JOIN users rvw ON r.reviewee_id = rvw.id
        JOIN jobs j ON r.job_id = j.id
      `;
      if (whereClause) sqliteQuery += whereClause;
      sqliteQuery += ' ORDER BY r.created_at DESC LIMIT ? OFFSET ?';
      result = db.exec(sqliteQuery, [...params.slice(0, -2), limit, offset]);
    }

    let countQuery = 'SELECT COUNT(*) as count FROM reviews r JOIN users rev ON r.reviewer_id = rev.id JOIN users rvw ON r.reviewee_id = rvw.id JOIN jobs j ON r.job_id = j.id';
    if (whereClause) countQuery += ' ' + whereClause;

    let countResult;
    if (usePostgres) {
      countResult = await db.query(countQuery, params.slice(0, -2));
    } else {
      countResult = db.exec(countQuery, params.slice(0, -2));
    }

    const totalCount = usePostgres ? countResult.rows[0].count : countResult[0].values[0][0];

    const reviews = usePostgres
      ? result.rows.map(r => ({
          id: r.id,
          jobId: r.job_id,
          reviewerId: r.reviewer_id,
          revieweeId: r.reviewee_id,
          rating: r.rating,
          comment: r.comment,
          createdAt: r.created_at,
          reviewerName: r.reviewer_name,
          reviewerEmail: r.reviewer_email,
          revieweeName: r.reviewee_name,
          revieweeEmail: r.reviewee_email,
          jobTitle: r.job_title
        }))
      : (result.length > 0 ? result[0].values.map(r => ({
          id: r[0],
          jobId: r[1],
          reviewerId: r[2],
          revieweeId: r[3],
          rating: r[4],
          comment: r[5],
          createdAt: r[6],
          reviewerName: r[7],
          reviewerEmail: r[8],
          revieweeName: r[9],
          revieweeEmail: r[10],
          jobTitle: r[11]
        })) : []);

    res.json({
      reviews,
      pagination: {
        page,
        limit,
        totalPages: Math.ceil(totalCount / limit),
        totalCount
      }
    });
  } catch (err) {
    console.error('[admin/reviews] Error:', err);
    res.status(500).json({ error: 'Failed to fetch reviews' });
  }
});

// DELETE /api/admin/reviews/:id - Delete a review (moderation)
router.delete('/reviews/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const reviewId = req.params.id;
    const db = await getDb();

    if (usePostgres) {
      const rRes = await db.query('SELECT * FROM reviews WHERE id = $1', [reviewId]);
      if (rRes.rowCount === 0) {
        return res.status(404).json({ error: 'Review not found' });
      }

      const review = rRes.rows[0];
      const revieweeId = review.reviewee_id;

      await db.query('DELETE FROM reviews WHERE id = $1', [reviewId]);

      const statsRes = await db.query('SELECT AVG(rating) as avg, COUNT(*) as cnt FROM reviews WHERE reviewee_id = $1', [revieweeId]);
      if (statsRes.rowCount > 0 && statsRes.rows[0].avg !== null) {
        await db.query('UPDATE users SET rating = $1, review_count = $2 WHERE id = $3',
          [parseFloat(statsRes.rows[0].avg).toFixed(2), statsRes.rows[0].cnt, revieweeId]);
      } else {
        await db.query('UPDATE users SET rating = 0, review_count = 0 WHERE id = $1', [revieweeId]);
      }

      res.json({ message: 'Review deleted successfully' });
    } else {
      const rResult = db.exec('SELECT * FROM reviews WHERE id = ?', [reviewId]);
      if (rResult.length === 0 || rResult[0].values.length === 0) {
        return res.status(404).json({ error: 'Review not found' });
      }

      const review = rResult[0].values[0];
      const revieweeId = review[3];

      db.run('DELETE FROM reviews WHERE id = ?', [reviewId]);

      const statsResult = db.exec('SELECT AVG(rating), COUNT(*) FROM reviews WHERE reviewee_id = ?', [revieweeId]);
      if (statsResult.length > 0 && statsResult[0].values.length > 0) {
        const avg = statsResult[0].values[0][0];
        const cnt = statsResult[0].values[0][1];
        if (avg !== null) {
          db.run('UPDATE users SET rating = ?, review_count = ? WHERE id = ?', [avg.toFixed(2), cnt, revieweeId]);
        } else {
          db.run('UPDATE users SET rating = 0, review_count = 0 WHERE id = ?', [revieweeId]);
        }
      }

      save();
      res.json({ message: 'Review deleted successfully' });
    }
  } catch (err) {
    console.error('[admin/reviews/:id] Error:', err);
    res.status(500).json({ error: 'Failed to delete review' });
  }
});

module.exports = router;