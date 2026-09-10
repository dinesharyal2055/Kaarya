const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { getDb, save, usePostgres } = require('../db');
const { requireAuth, signToken, signTokenWithJti, addToBlocklist, hashPassword, verifyPassword } = require('../middleware/auth');
const { sendRegistrationOtp, sendPasswordReset } = require('../mailer');
const { loginLimiter, otpLimiter, registerLimiter } = require('../middleware/rateLimit');
const { checkGuard, recordFailure, recordSuccess } = require('../middleware/loginGuard');
const { validate, register, verifyOtp, resendOtp, login: loginSchema, forgotPassword, verifyResetOtp, resetPassword, updateProfile, uploadAvatar, updateRole } = require('../middleware/validate');
const { sanitize } = require('../middleware/sanitize');

const router = express.Router();

const OTP_EXPIRY_MINUTES = 10;
const OTP_LENGTH = 6;
const IS_DEV = process.env.NODE_ENV !== 'production';

/**
 * Development-only logger — never logs in production.
 * Uses a no-op in production so there is zero overhead.
 */
const devLog = (...args) => {
  if (IS_DEV) console.log(...args);
};

// ─── Helpers ──────────────────────────────────────────────────────────

function userFromRow(row, db = null) {
  // row: [id, name, email, phone, password_hash, role, avatar_url, bio, rating, review_count, is_verified, is_active, fcm_token, created_at, updated_at]
  // PostgreSQL returns objects, SQLite returns arrays
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
  const createdAt = isObj ? row.created_at : row[13];

  // In PG, is_verified is BOOLEAN. In SQLite, it is 0/1.
  const isVerified = usePostgres ? (isVerifiedVal === true) : (isVerifiedVal === 1);

  let verificationStatus = isVerified ? 'verified' : 'unverified';

  // If not verified, check for a pending/rejected verification request
  if (!isVerified && db) {
    if (usePostgres) {
      // Logic for checking status in PG is handled by the caller or needs a separate await
      // However, to keep this helper synchronous and simple, we assume the caller handles this
      // OR we just return unverified and let the FE handle the status polling
    } else {
      const reqResult = db.exec(
        `SELECT status FROM verification_requests WHERE user_id = ? ORDER BY id DESC LIMIT 1`,
        [id]
      );
      if (reqResult.length > 0 && reqResult[0].values.length > 0) {
        const reqStatus = reqResult[0].values[0][0];
        if (reqStatus === 'pending') verificationStatus = 'pending';
        else if (reqStatus === 'rejected' || reqStatus === 'more_info_needed') verificationStatus = 'rejected';
      }
    }
  }

  return {
    id,
    phone,
    email,
    name,
    role,
    avatarUrl: avatarUrl || undefined,
    bio: bio || undefined,
    verificationStatus,
    rating: rating ?? undefined,
    reviewCount: reviewCount ?? 0,
    completionRate: 0,
    createdAt: createdAt,
  };
}

async function userResponse(userId) {
  const db = await getDb();
  if (usePostgres) {
    const res = await db.query(
      'SELECT id, name, email, phone, password_hash, role, avatar_url, bio, rating, review_count, is_verified, is_active, fcm_token, created_at, updated_at FROM users WHERE id = $1',
      [userId]
    );
    if (res.rowCount === 0) return null;

    const user = userFromRow(res.rows[0]);

    // Check verification status
    if (user.verificationStatus !== 'verified') {
      const reqRes = await db.query(
        'SELECT status FROM verification_requests WHERE user_id = $1 ORDER BY id DESC LIMIT 1',
        [userId]
      );
      if (reqRes.rowCount > 0) {
        const reqStatus = reqRes.rows[0].status;
        if (reqStatus === 'pending') user.verificationStatus = 'pending';
        else if (reqStatus === 'rejected' || reqStatus === 'more_info_needed') user.verificationStatus = 'rejected';
      }
    }

    return user;
  } else {
    const result = db.exec(
      'SELECT id, name, email, phone, password_hash, role, avatar_url, bio, rating, review_count, is_verified, is_active, fcm_token, created_at, updated_at FROM users WHERE id = ?',
      [userId]
    );
    if (result.length === 0 || result[0].values.length === 0) return null;
    return userFromRow(result[0].values[0], db);
  }
}

function generateOTP() {
  return String(crypto.randomInt(100000, 1000000));
}

async function deleteExpiredOtps(db) {
  if (usePostgres) {
    await db.query('DELETE FROM otp_codes WHERE expires_at < NOW()');
  } else {
    db.run('DELETE FROM otp_codes WHERE expires_at < datetime("now")');
  }
}

// ─── Registration ──────────────────────────────────────────────────────

// POST /api/auth/register  — initiate registration (sends OTP to email)
router.post('/register', registerLimiter, validate(register), async (req, res) => {
  try {
    const { name, email, phone, password, role } = res.locals.parsedBody;
    const db = await getDb();

    if (usePostgres) {
      // Check duplicate phone
      const existingPhone = await db.query('SELECT id FROM users WHERE phone = $1', [phone]);
      if (existingPhone.rowCount > 0) {
        return res.status(409).json({ error: 'Phone number already registered' });
      }
      // Check duplicate email
      const existingEmail = await db.query('SELECT id FROM users WHERE email = $1', [email]);
      if (existingEmail.rowCount > 0) {
        return res.status(409).json({ error: 'Email already registered' });
      }

      await deleteExpiredOtps(db);

      // Delete any old OTPs for this email
      await db.query('DELETE FROM otp_codes WHERE phone = $1 AND type = $2', [email, 'register']);

      // Generate OTP
      const code = generateOTP();
      const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

      // Store registration data alongside OTP
      const regData = JSON.stringify({ name, phone, password, role });

      await db.query(
        'INSERT INTO otp_codes (phone, code, type, expires_at, data) VALUES ($1, $2, $3, $4, $5)',
        [email, code, 'register', expiresAt, regData]
      );

      // Send email via Resend
      sendRegistrationOtp(email, name, code).catch(err => {
        console.error('[EMAIL ERROR] Failed to send registration OTP:', err.message);
      });

      devLog(`[REGISTER] OTP for ${email} (phone: ${phone}): ${code}`);

      const response = {
        message: 'Verification code sent to your email',
        email,
        expiresIn: OTP_EXPIRY_MINUTES * 60,
      };
      if (IS_DEV) response.testOtpCode = code;
      res.json(response);

    } else {
      // SQLite implementation
      const existingPhone = db.exec('SELECT id FROM users WHERE phone = ?', [phone]);
      if (existingPhone.length > 0 && existingPhone[0].values.length > 0) {
        return res.status(409).json({ error: 'Phone number already registered' });
      }
      const existingEmail = db.exec('SELECT id FROM users WHERE email = ?', [email]);
      if (existingEmail.length > 0 && existingEmail[0].values.length > 0) {
        return res.status(409).json({ error: 'Email already registered' });
      }

      await deleteExpiredOtps(db);
      db.run('DELETE FROM otp_codes WHERE phone = ? AND type = ?', [email, 'register']);

      const code = generateOTP();
      const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000)
        .toISOString()
        .replace('T', ' ')
        .slice(0, 19);

      const regData = JSON.stringify({ name, phone, password, role });
      db.run(
        'INSERT INTO otp_codes (phone, code, type, expires_at, data) VALUES (?, ?, ?, ?, ?)',
        [email, code, 'register', expiresAt, regData]
      );

      sendRegistrationOtp(email, name, code).catch(err => {
        console.error('[EMAIL ERROR] Failed to send registration OTP:', err.message);
      });

      devLog(`[REGISTER] OTP for ${email} (phone: ${phone}): ${code}`);

      const response = {
        message: 'Verification code sent to your email',
        email,
        expiresIn: OTP_EXPIRY_MINUTES * 60,
      };
      if (IS_DEV) response.testOtpCode = code;
      res.json(response);
    }
  } catch (err) {
    console.error('[auth/register]', err);
    res.status(500).json({ error: 'Registration initiation failed' });
  }
});

// POST /api/auth/register/initiate  — email-specific alias for /register
router.post('/register/initiate', registerLimiter, async (req, res) => {
  req.url = '/register';
  return router(req, res);
});

// POST /api/auth/register/verify  — verify OTP and create account
router.post('/register/verify', otpLimiter, validate(verifyOtp), async (req, res) => {
  try {
    const { email, code } = res.locals.parsedBody;
    const db = await getDb();
    await deleteExpiredOtps(db);

    if (usePostgres) {
      // Find valid OTP
      const result = await db.query(
        'SELECT id, attempts, data FROM otp_codes WHERE phone = $1 AND type = $2 AND code = $3 ORDER BY id DESC LIMIT 1',
        [email, 'register', code]
      );

      if (result.rowCount === 0) {
        return res.status(401).json({ error: 'Invalid or expired OTP' });
      }

      const { id: otpId, attempts, data: dataJson } = result.rows[0];
      if (attempts >= 5) {
        await db.query('DELETE FROM otp_codes WHERE id = $1', [otpId]);
        return res.status(401).json({ error: 'Too many failed attempts. Please request a new OTP.' });
      }

      // Increment attempts
      await db.query('UPDATE otp_codes SET attempts = attempts + 1 WHERE id = $1', [otpId]);

      if (!dataJson) {
        return res.status(400).json({ error: 'Registration session expired. Please start over.' });
      }
      let regData;
      try { regData = JSON.parse(dataJson); } catch {
        return res.status(400).json({ error: 'Registration session expired. Please start over.' });
      }

      const { name, phone, password, role } = regData;

      // Final duplicate checks
      const existingPhone = await db.query('SELECT id FROM users WHERE phone = $1', [phone]);
      if (existingPhone.rowCount > 0) return res.status(409).json({ error: 'Phone number already registered' });

      const existingEmail = await db.query('SELECT id FROM users WHERE email = $1', [email]);
      if (existingEmail.rowCount > 0) return res.status(409).json({ error: 'Email already registered' });

      // Create user
      const passwordHash = await hashPassword(password);
      const insertRes = await db.query(
        'INSERT INTO users (name, email, phone, password_hash, role, is_active, is_verified) VALUES ($1, $2, $3, $4, $5, TRUE, FALSE) RETURNING id',
        [name, email, phone, passwordHash, role]
      );

      const userId = insertRes.rows[0].id;
      await db.query('DELETE FROM otp_codes WHERE id = $1', [otpId]);

      const user = await userResponse(userId);
      devLog(`[REGISTER] Account created for ${email} (id: ${userId})`);
      res.status(201).json({ message: 'Account created successfully', user });

    } else {
      // SQLite implementation
      const result = db.exec(
        'SELECT id, attempts, data FROM otp_codes WHERE phone = ? AND type = ? AND code = ? ORDER BY id DESC LIMIT 1',
        [email, 'register', code]
      );

      if (result.length === 0 || result[0].values.length === 0) {
        return res.status(401).json({ error: 'Invalid or expired OTP' });
      }

      const [otpId, attempts, dataJson] = result[0].values[0];
      if (attempts >= 5) {
        db.run('DELETE FROM otp_codes WHERE id = ?', [otpId]);
        return res.status(401).json({ error: 'Too many failed attempts. Please request a new OTP.' });
      }

      db.run('UPDATE otp_codes SET attempts = attempts + 1 WHERE id = ?', [otpId]);

      if (!dataJson) return res.status(400).json({ error: 'Registration session expired. Please start over.' });
      let regData;
      try { regData = JSON.parse(dataJson); } catch {
        return res.status(400).json({ error: 'Registration session expired. Please start over.' });
      }

      const { name, phone, password, role } = regData;

      const existingPhone = db.exec('SELECT id FROM users WHERE phone = ?', [phone]);
      if (existingPhone.length > 0 && existingPhone[0].values.length > 0) return res.status(409).json({ error: 'Phone number already registered' });

      const existingEmail = db.exec('SELECT id FROM users WHERE email = ?', [email]);
      if (existingEmail.length > 0 && existingEmail[0].values.length > 0) return res.status(409).json({ error: 'Email already registered' });

      const passwordHash = await hashPassword(password);
      db.run(
        'INSERT INTO users (name, email, phone, password_hash, role, is_active, is_verified) VALUES (?, ?, ?, ?, ?, 1, 0)',
        [name, email, phone, passwordHash, role]
      );

      const newUser = db.exec('SELECT last_insert_rowid() as id');
      const userId = newUser[0].values[0][0];

      db.run('DELETE FROM otp_codes WHERE id = ?', [otpId]);

      const user = await userResponse(userId);
      devLog(`[REGISTER] Account created for ${email} (id: ${userId})`);
      res.status(201).json({ message: 'Account created successfully', user });
    }
  } catch (err) {
    console.error('[auth/register/verify]', err);
    res.status(500).json({ error: 'Account creation failed' });
  }
});

// POST /api/auth/register/resend  — resend OTP for pending registration
router.post('/register/resend', otpLimiter, validate(resendOtp), async (req, res) => {
  try {
    const { email } = res.locals.parsedBody;
    const db = await getDb();

    if (usePostgres) {
      const existing = await db.query('SELECT id FROM users WHERE email = $1', [email]);
      if (existing.rowCount > 0) return res.status(409).json({ error: 'Email already registered' });

      const existingOtp = await db.query(
        'SELECT data FROM otp_codes WHERE phone = $1 AND type = $2 ORDER BY id DESC LIMIT 1',
        [email, 'register']
      );

      let name = 'User';
      let regDataJson = null;
      if (existingOtp.rowCount > 0 && existingOtp.rows[0].data) {
        try {
          const existingData = JSON.parse(existingOtp.rows[0].data);
          name = existingData.name || 'User';
          regDataJson = existingOtp.rows[0].data;
        } catch {}
      }

      await deleteExpiredOtps(db);
      await db.query('DELETE FROM otp_codes WHERE phone = $1 AND type = $2', [email, 'register']);

      const code = generateOTP();
      const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

      await db.query(
        'INSERT INTO otp_codes (phone, code, type, expires_at, data) VALUES ($1, $2, $3, $4, $5)',
        [email, code, 'register', expiresAt, regDataJson]
      );

      sendRegistrationOtp(email, name, code).catch(err => {
        console.error('[EMAIL ERROR] Failed to resend registration OTP:', err.message);
      });

      devLog(`[REGISTER] Resend OTP for ${email}: ${code}`);

      const response = {
        message: 'Verification code sent to your email',
        expiresIn: OTP_EXPIRY_MINUTES * 60,
      };
      if (IS_DEV) response.testOtpCode = code;
      res.json(response);

    } else {
      // SQLite implementation
      const existing = db.exec('SELECT id FROM users WHERE email = ?', [email]);
      if (existing.length > 0 && existing[0].values.length > 0) return res.status(409).json({ error: 'Email already registered' });

      const existingOtp = db.exec(
        'SELECT data FROM otp_codes WHERE phone = ? AND type = ? ORDER BY id DESC LIMIT 1',
        [email, 'register']
      );
      let name = 'User';
      let regDataJson = null;
      if (existingOtp.length > 0 && existingOtp[0].values.length > 0 && existingOtp[0].values[0][0]) {
        try {
          const existingData = JSON.parse(existingOtp[0].values[0][0]);
          name = existingData.name || 'User';
          regDataJson = existingOtp[0].values[0][0];
        } catch {}
      }

      await deleteExpiredOtps(db);
      db.run('DELETE FROM otp_codes WHERE phone = ? AND type = ?', [email, 'register']);

      const code = generateOTP();
      const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000)
        .toISOString().replace('T', ' ').slice(0, 19);

      db.run(
        'INSERT INTO otp_codes (phone, code, type, expires_at, data) VALUES (?, ?, ?, ?, ?)',
        [email, code, 'register', expiresAt, regDataJson]
      );

      sendRegistrationOtp(email, name, code).catch(err => {
        console.error('[EMAIL ERROR] Failed to resend registration OTP:', err.message);
      });

      devLog(`[REGISTER] Resend OTP for ${email}: ${code}`);

      const response = {
        message: 'Verification code sent to your email',
        expiresIn: OTP_EXPIRY_MINUTES * 60,
      };
      if (IS_DEV) response.testOtpCode = code;
      res.json(response);
    }
  } catch (err) {
    console.error('[auth/register/resend]', err);
    res.status(500).json({ error: 'Failed to resend OTP' });
  }
});

// POST /api/auth/register/resend-otp  — alias for /register/resend (email-based)
router.post('/register/resend-otp', otpLimiter, async (req, res) => {
  req.url = '/register/resend';
  return router(req, res);
});

// ─── Login ────────────────────────────────────────────────────────────

/** Generic error — never reveals cause to prevent enumeration */
const genericError = (res) => res.status(401).json({ error: 'Invalid credentials' });

// POST /api/auth/login
router.post('/login', loginLimiter, validate(loginSchema), async (req, res) => {
  try {
    const { email, password } = res.locals.parsedBody;

    const guard = checkGuard(email);
    if (!guard.allowed) {
      await new Promise(v => setTimeout(v, 1000));
      return genericError(res);
    }

    const db = await getDb();
    let userRow, passwordHash;

    if (usePostgres) {
      const result = await db.query(
        'SELECT id, name, email, phone, password_hash, role, avatar_url, bio, rating, review_count, is_verified, is_active, fcm_token, created_at, updated_at FROM users WHERE email = $1',
        [email]
      );
      if (result.rowCount > 0) {
        userRow = result.rows[0];
        passwordHash = userRow.password_hash;
      }
    } else {
      const result = db.exec(
        'SELECT id, name, email, phone, password_hash, role, avatar_url, bio, rating, review_count, is_verified, is_active, fcm_token, created_at, updated_at FROM users WHERE email = ?',
        [email]
      );
      if (result.length > 0 && result[0].values.length > 0) {
        userRow = result[0].values[0];
        passwordHash = userRow[4];
      }
    }

    if (!userRow) {
      const fail = recordFailure(email);
      await new Promise(v => setTimeout(v, Math.min(fail.delay, 5000)));
      return genericError(res);
    }

    const valid = await verifyPassword(password, passwordHash);

    if (!valid) {
      const fail = recordFailure(email);
      if (fail.lockout) {
        const uEmail = usePostgres ? userRow.email : userRow[2];
        const uName = usePostgres ? userRow.name : userRow[1];
        sendPasswordReset(uEmail, uName, 'LOCKED').catch(() => {});
      }
      await new Promise(v => setTimeout(v, Math.min(fail.delay, 5000)));
      return genericError(res);
    }

    recordSuccess(email);

    const userId = usePostgres ? userRow.id : userRow[0];
    const { token } = signTokenWithJti(userId);
    const user = userFromRow(userRow);

    res.json({ token, user });
  } catch (err) {
    console.error('[auth/login]', err);
    res.status(500).json({ error: 'Login failed' });
  }
});

// ─── Forgot Password ─────────────────────────────────────────────────

// POST /api/auth/forgot-password
router.post('/forgot-password', otpLimiter, validate(forgotPassword), async (req, res) => {
  try {
    const { phone, email } = res.locals.parsedBody;
    const identifier = email || phone;
    const db = await getDb();

    let userRow;
    if (usePostgres) {
      const resByPhone = await db.query('SELECT id, name, email FROM users WHERE phone = $1', [phone || '']);
      const resByEmail = await db.query('SELECT id, name, email FROM users WHERE email = $1', [email || '']);
      userRow = resByPhone.rowCount > 0 ? resByPhone.rows[0] : (resByEmail.rowCount > 0 ? resByEmail.rows[0] : null);
    } else {
      const byPhone = db.exec('SELECT id, name, email FROM users WHERE phone = ?', [phone || '']);
      const byEmail = db.exec('SELECT id, name, email FROM users WHERE email = ?', [email || '']);
      userRow = (byPhone.length > 0 && byPhone[0].values.length > 0) ? byPhone[0].values[0] :
                ((byEmail.length > 0 && byEmail[0].values.length > 0) ? byEmail[0].values[0] : null);
    }

    const userName = userRow ? (usePostgres ? userRow.name : userRow[1]) : 'User';
    const userEmail = userRow ? (usePostgres ? userRow.email : userRow[2]) : (email || null);
    const isEmailFlow = !!email;

    if (!userRow) {
      return res.json({ message: 'If an account exists, an OTP has been sent' });
    }

    await deleteExpiredOtps(db);

    const otpType = isEmailFlow ? 'forgot_password_email' : 'forgot_password';
    if (usePostgres) {
      await db.query('DELETE FROM otp_codes WHERE phone = $1 AND type = $2', [identifier, otpType]);
    } else {
      db.run('DELETE FROM otp_codes WHERE phone = ? AND type = ?', [identifier, otpType]);
    }

    const code = generateOTP();
    const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

    if (usePostgres) {
      await db.query(
        'INSERT INTO otp_codes (phone, code, type, expires_at) VALUES ($1, $2, $3, $4)',
        [identifier, code, otpType, expiresAt]
      );
    } else {
      const expStr = expiresAt.toISOString().replace('T', ' ').slice(0, 19);
      db.run(
        'INSERT INTO otp_codes (phone, code, type, expires_at) VALUES (?, ?, ?, ?)',
        [identifier, code, otpType, expStr]
      );
    }

    if (isEmailFlow && userEmail) {
      sendPasswordReset(userEmail, userName, code).catch(err => {
        console.error('[EMAIL ERROR] Failed to send password reset email:', err.message);
      });
    }

    devLog(`[FORGOT] OTP for ${identifier}: ${code}`);

    const response = {
      message: 'If an account exists, an OTP has been sent',
      identifier: isEmailFlow ? email : maskPhone(phone),
      expiresIn: OTP_EXPIRY_MINUTES * 60,
    };
    if (IS_DEV) response.testOtpCode = code;
    res.json(response);
  } catch (err) {
    console.error('[auth/forgot-password]', err);
    res.status(500).json({ error: 'Failed to send OTP' });
  }
});

// POST /api/auth/forgot-password/verify
router.post('/forgot-password/verify', otpLimiter, validate(verifyResetOtp), async (req, res) => {
  try {
    const { phone, email, code } = res.locals.parsedBody;
    const identifier = email || phone;
    const db = await getDb();
    await deleteExpiredOtps(db);

    if (usePostgres) {
      const result = await db.query(
        'SELECT id, attempts FROM otp_codes WHERE phone = $1 AND code = $2 AND type IN ($3, $4) ORDER BY id DESC LIMIT 1',
        [identifier, code, 'forgot_password', 'forgot_password_email']
      );
      if (result.rowCount === 0) return res.status(401).json({ error: 'Invalid or expired OTP' });

      const { id: otpId, attempts } = result.rows[0];
      if (attempts >= 5) {
        await db.query('DELETE FROM otp_codes WHERE id = $1', [otpId]);
        return res.status(401).json({ error: 'Too many failed attempts. Please request a new OTP.' });
      }
      await db.query('UPDATE otp_codes SET attempts = attempts + 1 WHERE id = $1', [otpId]);
    } else {
      const result = db.exec(
        'SELECT id, attempts FROM otp_codes WHERE phone = ? AND code = ? AND type IN (?, ?) ORDER BY id DESC LIMIT 1',
        [identifier, code, 'forgot_password', 'forgot_password_email']
      );
      if (result.length === 0 || result[0].values.length === 0) return res.status(401).json({ error: 'Invalid or expired OTP' });

      const [otpId, attempts] = result[0].values[0];
      if (attempts >= 5) {
        db.run('DELETE FROM otp_codes WHERE id = ?', [otpId]);
        return res.status(401).json({ error: 'Too many failed attempts. Please request a new OTP.' });
      }
      db.run('UPDATE otp_codes SET attempts = attempts + 1 WHERE id = ?', [otpId]);
    }

    res.json({ message: 'OTP verified', identifier });
  } catch (err) {
    console.error('[auth/forgot-password/verify]', err);
    res.status(500).json({ error: 'OTP verification failed' });
  }
});

// POST /api/auth/forgot-password/reset
router.post('/forgot-password/reset', loginLimiter, validate(resetPassword), async (req, res) => {
  try {
    const { phone, email, code, newPassword } = res.locals.parsedBody;
    const identifier = email || phone;
    const db = await getDb();
    await deleteExpiredOtps(db);

    let otpId, attempts;
    if (usePostgres) {
      const result = await db.query(
        'SELECT id, attempts FROM otp_codes WHERE phone = $1 AND code = $2 AND type IN ($3, $4) ORDER BY id DESC LIMIT 1',
        [identifier, code, 'forgot_password', 'forgot_password_email']
      );
      if (result.rowCount === 0) return res.status(401).json({ error: 'Invalid or expired OTP' });
      otpId = result.rows[0].id;
      attempts = result.rows[0].attempts;
    } else {
      const result = db.exec(
        'SELECT id, attempts FROM otp_codes WHERE phone = ? AND code = ? AND type IN (?, ?) ORDER BY id DESC LIMIT 1',
        [identifier, code, 'forgot_password', 'forgot_password_email']
      );
      if (result.length === 0 || result[0].values.length === 0) return res.status(401).json({ error: 'Invalid or expired OTP' });
      otpId = result[0].values[0][0];
      attempts = result[0].values[0][1];
    }

    if (attempts >= 5) {
      if (usePostgres) await db.query('DELETE FROM otp_codes WHERE id = $1', [otpId]);
      else db.run('DELETE FROM otp_codes WHERE id = ?', [otpId]);
      return res.status(401).json({ error: 'Too many failed attempts. Please request a new OTP.' });
    }

    if (usePostgres) await db.query('UPDATE otp_codes SET attempts = attempts + 1 WHERE id = $1', [otpId]);
    else db.run('UPDATE otp_codes SET attempts = attempts + 1 WHERE id = ?', [otpId]);

    let userId;
    if (usePostgres) {
      const resByPhone = await db.query('SELECT id FROM users WHERE phone = $1', [phone || '']);
      const resByEmail = await db.query('SELECT id FROM users WHERE email = $1', [email || '']);
      const userRow = resByPhone.rowCount > 0 ? resByPhone.rows[0] : (resByEmail.rowCount > 0 ? resByEmail.rows[0] : null);
      if (!userRow) return res.status(404).json({ error: 'User not found' });
      userId = userRow.id;
    } else {
      const byPhone = db.exec('SELECT id FROM users WHERE phone = ?', [phone || '']);
      const byEmail = db.exec('SELECT id FROM users WHERE email = ?', [email || '']);
      const userResult = byPhone.length > 0 && byPhone[0].values.length > 0 ? byPhone : byEmail;
      if (userResult.length === 0 || userResult[0].values.length === 0) return res.status(404).json({ error: 'User not found' });
      userId = userResult[0].values[0][0];
    }

    const passwordHash = await hashPassword(newPassword);
    if (usePostgres) {
      await db.query('UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2', [passwordHash, userId]);
      await db.query('DELETE FROM otp_codes WHERE id = $1', [otpId]);
    } else {
      db.run('UPDATE users SET password_hash = ?, updated_at = datetime("now") WHERE id = ?', [passwordHash, userId]);
      db.run('DELETE FROM otp_codes WHERE id = ?', [otpId]);
    }

    res.json({ message: 'Password reset successfully. Please log in with your new password.' });
  } catch (err) {
    console.error('[auth/forgot-password/reset]', err);
    res.status(500).json({ error: 'Password reset failed' });
  }
});

router.post('/verify-reset-otp', otpLimiter, async (req, res) => {
  req.url = '/forgot-password/verify';
  return router(req, res);
});

router.post('/resend-reset-otp', otpLimiter, async (req, res) => {
  req.url = '/forgot-password';
  return router(req, res);
});

router.post('/reset-password', loginLimiter, async (req, res) => {
  req.url = '/forgot-password/reset';
  return router(req, res);
});

// ─── Profile update ─────────────────────────────────────────────────

// PUT /api/auth/profile
router.put('/profile', requireAuth, sanitize('name', 'bio'), validate(updateProfile), async (req, res) => {
  try {
    const { name, bio } = res.locals.parsedBody;
    const db = await getDb();

    const updates = [];
    const values = [];
    let paramIndex = 1;

    if (name !== undefined) {
      updates.push(usePostgres ? `name = $${paramIndex++}` : 'name = ?');
      values.push(name.trim());
    }

    if (bio !== undefined) {
      updates.push(usePostgres ? `bio = $${paramIndex++}` : 'bio = ?');
      values.push(bio?.trim() || null);
    }

    updates.push(usePostgres ? `updated_at = NOW()` : 'updated_at = datetime("now")');
    values.push(req.userId);

    if (usePostgres) {
      await db.query(`UPDATE users SET ${updates.join(', ')} WHERE id = $${paramIndex}`, values);
    } else {
      db.run(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, values);
      save();
    }

    const user = await userResponse(req.userId);
    res.json(user);
  } catch (err) {
    console.error('[auth/profile PUT]', err);
    res.status(500).json({ error: 'Profile update failed' });
  }
});

// PUT /api/auth/avatar — upload profile picture
router.put('/avatar', requireAuth, validate(uploadAvatar), async (req, res) => {
  try {
    const { image, filename } = res.locals.parsedBody;

    const base64Data = image.replace(/^data:image\/\w+;base64,/, '');
    let buffer;
    try { buffer = Buffer.from(base64Data, 'base64'); } catch {
      return res.status(400).json({ error: 'Invalid base64 image data' });
    }

    if (buffer.length > 5 * 1024 * 1024) return res.status(400).json({ error: 'Image too large (max 5MB)' });

    const mime = req.body.mime || 'image/jpeg';
    const ext = mime === 'image/png' ? 'png' : 'jpg';
    const storedFilename = `avatar_${req.userId}_${Date.now()}.${ext}`;

    const avatarsDir = path.join(__dirname, '..', 'uploads', 'avatars');
    if (!fs.existsSync(avatarsDir)) fs.mkdirSync(avatarsDir, { recursive: true });

    fs.writeFileSync(path.join(avatarsDir, storedFilename), buffer);
    const avatarUrl = `/uploads/avatars/${storedFilename}`;

    const db = await getDb();
    if (usePostgres) {
      await db.query('UPDATE users SET avatar_url = $1, updated_at = NOW() WHERE id = $2', [avatarUrl, req.userId]);
    } else {
      db.run('UPDATE users SET avatar_url = ?, updated_at = datetime("now") WHERE id = ?', [avatarUrl, req.userId]);
      save();
    }

    const user = await userResponse(req.userId);
    res.json(user);
  } catch (err) {
    console.error('[auth/avatar PUT]', err);
    res.status(500).json({ error: 'Failed to upload avatar' });
  }
});

// PUT /api/auth/role  — switch between seeker and provider
router.put('/role', requireAuth, validate(updateRole), async (req, res) => {
  try {
    const { role } = res.locals.parsedBody;
    const db = await getDb();
    if (usePostgres) {
      await db.query('UPDATE users SET role = $1, updated_at = NOW() WHERE id = $2', [role, req.userId]);
    } else {
      db.run('UPDATE users SET role = ?, updated_at = datetime("now") WHERE id = ?', [role, req.userId]);
      save();
    }
    const user = await userResponse(req.userId);
    res.json(user);
  } catch (err) {
    console.error('[auth/role PUT]', err);
    res.status(500).json({ error: 'Role switch failed' });
  }
});

// ─── Profile ─────────────────────────────────────────────────────────

// GET /api/auth/me
router.get('/me', requireAuth, async (req, res) => {
  try {
    const user = await userResponse(req.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  } catch (err) {
    console.error('[auth/me]', err);
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

// POST /api/auth/logout
router.post('/logout', requireAuth, async (req, res) => {
  try {
    if (req.tokenJti && req.tokenExp) {
      const expiresAt = new Date(req.tokenExp * 1000).toISOString();
      await addToBlocklist(req.tokenJti, expiresAt);
    }
    res.json({ message: 'Logged out successfully' });
  } catch (err) {
    console.error('[auth/logout]', err);
    res.json({ message: 'Logged out successfully' });
  }
});

// ─── Utility ─────────────────────────────────────────────────────────

function maskPhone(phone) {
  if (!phone || phone.length < 4) return phone;
  return phone.slice(0, 3) + '****' + phone.slice(-3);
}

module.exports = router;
