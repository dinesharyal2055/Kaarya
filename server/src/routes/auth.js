const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { getDb, save } = require('../db');
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
  const isVerified = row[10] === 1;

  let verificationStatus = isVerified ? 'verified' : 'unverified';

  // If not verified, check for a pending/rejected verification request
  if (!isVerified && db) {
    const reqResult = db.exec(
      `SELECT status FROM verification_requests WHERE user_id = ? ORDER BY id DESC LIMIT 1`,
      [String(row[0])]
    );
    if (reqResult.length > 0 && reqResult[0].values.length > 0) {
      const reqStatus = reqResult[0].values[0][0];
      if (reqStatus === 'pending') verificationStatus = 'pending';
      else if (reqStatus === 'rejected' || reqStatus === 'more_info_needed') verificationStatus = 'rejected';
    }
  }

  return {
    id: String(row[0]),
    phone: row[3],
    email: row[2],
    name: row[1],
    role: row[5],
    avatarUrl: row[6] || undefined,
    bio: row[7] || undefined,
    verificationStatus,
    rating: row[8] ?? undefined,
    reviewCount: row[9] ?? 0,
    completionRate: 0,
    createdAt: row[13],
  };
}

function userResponse(userId) {
  return getDb().then((db) => {
    const result = db.exec(
      'SELECT id, name, email, phone, password_hash, role, avatar_url, bio, rating, review_count, is_verified, is_active, fcm_token, created_at, updated_at FROM users WHERE id = ?',
      [userId]
    );
    if (result.length === 0 || result[0].values.length === 0) return null;
    return userFromRow(result[0].values[0], db);
  });
}

function generateOTP() {
  return String(crypto.randomInt(100000, 1000000));
}

function deleteExpiredOtps(db) {
  db.run('DELETE FROM otp_codes WHERE expires_at < datetime("now")');
}

// ─── Registration ──────────────────────────────────────────────────────
//
// Flow (mobile app):
//   Step 1: POST /auth/register   → sends OTP to email (Resend)
//   Step 2: POST /auth/register/verify → verifies OTP, creates user
//   Resend:  POST /auth/register/resend → resends OTP
//   Email-specific alias: POST /auth/register/initiate (same as /register)
//

// POST /api/auth/register  — initiate registration (sends OTP to email)
router.post('/register', registerLimiter, validate(register), async (req, res) => {
  try {
    const { name, email, phone, password, role } = res.locals.parsedBody;

    const db = await getDb();

    // Check duplicate phone
    const existingPhone = db.exec('SELECT id FROM users WHERE phone = ?', [phone]);
    if (existingPhone.length > 0 && existingPhone[0].values.length > 0) {
      return res.status(409).json({ error: 'Phone number already registered' });
    }

    // Check duplicate email
    const existingEmail = db.exec('SELECT id FROM users WHERE email = ?', [email]);
    if (existingEmail.length > 0 && existingEmail[0].values.length > 0) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    deleteExpiredOtps(db);

    // Delete any old OTPs for this email
    db.run('DELETE FROM otp_codes WHERE phone = ? AND type = ?', [email, 'register']);

    // Generate OTP
    const code = generateOTP();
    const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000)
      .toISOString()
      .replace('T', ' ')
      .slice(0, 19);

    // Store registration data alongside OTP (persisted to DB, survives server restart)
    const regData = JSON.stringify({ name, phone, password, role });

    db.run(
      'INSERT INTO otp_codes (phone, code, type, expires_at, data) VALUES (?, ?, ?, ?, ?)',
      [email, code, 'register', expiresAt, regData]
    );

    // Send email via Resend — fire and forget so response isn't blocked
    sendRegistrationOtp(email, name, code).catch(err => {
      console.error('[EMAIL ERROR] Failed to send registration OTP:', err.message);
    });

    devLog(`[REGISTER] OTP for ${email} (phone: ${phone}): ${code}`);

    const response = {
      message: 'Verification code sent to your email',
      email,
      expiresIn: OTP_EXPIRY_MINUTES * 60,
    };
    if (IS_DEV) response.testOtpCode = code; // NEVER exposed in production
    res.json(response);
  } catch (err) {
    console.error('[auth/register]', err);
    res.status(500).json({ error: 'Registration initiation failed' });
  }
});

// POST /api/auth/register/initiate  — email-specific alias for /register
router.post('/register/initiate', registerLimiter, async (req, res) => {
  // Delegate to /register handler by re-calling the same logic
  req.url = '/register';
  return router(req, res);
});

// POST /api/auth/register/verify  — verify OTP and create account
router.post('/register/verify', otpLimiter, validate(verifyOtp), async (req, res) => {
  try {
    const { email, code } = res.locals.parsedBody;

    const db = await getDb();
    deleteExpiredOtps(db);

    // Find valid OTP — stored with email as the phone field, include data column
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

    // Increment attempts counter on wrong OTP
    db.run('UPDATE otp_codes SET attempts = attempts + 1 WHERE id = ?', [otpId]);

    // Get pending registration data from OTP record (persisted to DB)
    if (!dataJson) {
      return res.status(400).json({ error: 'Registration session expired. Please start over.' });
    }
    let regData;
    try {
      regData = JSON.parse(dataJson);
    } catch {
      return res.status(400).json({ error: 'Registration session expired. Please start over.' });
    }

    const { name, phone, password, role } = regData;

    // Final duplicate checks (in case they registered via another flow)
    const existingPhone = db.exec('SELECT id FROM users WHERE phone = ?', [phone]);
    if (existingPhone.length > 0 && existingPhone[0].values.length > 0) {
      return res.status(409).json({ error: 'Phone number already registered' });
    }
    const existingEmail = db.exec('SELECT id FROM users WHERE email = ?', [email]);
    if (existingEmail.length > 0 && existingEmail[0].values.length > 0) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    // Create user — is_active = 1, is_verified = 1 (email verified via OTP)
    const passwordHash = await hashPassword(password);
    db.run(
      'INSERT INTO users (name, email, phone, password_hash, role, is_active, is_verified) VALUES (?, ?, ?, ?, ?, 1, 1)',
      [name, email, phone, passwordHash, role]
    );

    const newUser = db.exec('SELECT last_insert_rowid() as id');
    const userId = newUser[0].values[0][0];

    // Consume OTP
    db.run('DELETE FROM otp_codes WHERE id = ?', [otpId]);

    const user = await userResponse(userId);

    devLog(`[REGISTER] Account created for ${email} (id: ${userId})`);

    res.status(201).json({
      message: 'Account created successfully',
      user,
    });
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

    // Check if already registered
    const existing = db.exec('SELECT id FROM users WHERE email = ?', [email]);
    if (existing.length > 0 && existing[0].values.length > 0) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    // Get pending registration data from existing OTP record (if any)
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
        regDataJson = existingOtp[0].values[0][0]; // reuse the data
      } catch { /* use defaults */ }
    }

    deleteExpiredOtps(db);

    // Delete any old register OTPs
    db.run('DELETE FROM otp_codes WHERE phone = ? AND type = ?', [email, 'register']);

    const code = generateOTP();
    const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000)
      .toISOString()
      .replace('T', ' ')
      .slice(0, 19);

    db.run(
      'INSERT INTO otp_codes (phone, code, type, expires_at, data) VALUES (?, ?, ?, ?, ?)',
      [email, code, 'register', expiresAt, regDataJson]
    );

    // Send email via Resend — fire and forget
    sendRegistrationOtp(email, name, code).catch(err => {
      console.error('[EMAIL ERROR] Failed to resend registration OTP:', err.message);
    });

    devLog(`[REGISTER] Resend OTP for ${email}: ${code}`);

    const response = {
      message: 'Verification code sent to your email',
      expiresIn: OTP_EXPIRY_MINUTES * 60,
    };
    if (IS_DEV) response.testOtpCode = code; // NEVER exposed in production
    res.json(response);
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
    const { phone, password } = res.locals.parsedBody;

    // 1. Check lockout before any other logic
    const guard = checkGuard(phone);
    if (!guard.allowed) {
      // Deliberate delay to mask lockout vs other failures
      await new Promise(r => setTimeout(r, 1000));
      return genericError(res);
    }

    const db = await getDb();
    const result = db.exec(
      'SELECT id, name, email, phone, password_hash, role, avatar_url, bio, rating, review_count, is_verified, is_active, fcm_token, created_at, updated_at FROM users WHERE phone = ?',
      [phone]
    );

    if (result.length === 0 || result[0].values.length === 0) {
      // User not found — still record failure for brute-force uniformity
      const fail = recordFailure(phone);
      if (fail.lockout) {
        // Cannot send email (no user record) — just delay and return generic error
        await new Promise(r => setTimeout(r, Math.min(fail.delay, 5000)));
        return genericError(res);
      }
      await new Promise(r => setTimeout(r, Math.min(fail.delay, 5000)));
      return genericError(res);
    }

    const row = result[0].values[0];
    const valid = await verifyPassword(password, row[4]);

    if (!valid) {
      const fail = recordFailure(phone);
      if (fail.lockout) {
        // Lockout triggered — send notification email, then delay and return generic error
        const userEmail = row[2];
        const userName = row[1];
        sendPasswordReset(userEmail, userName, 'LOCKED').catch(() => {});
        await new Promise(r => setTimeout(r, Math.min(fail.delay, 5000)));
        return genericError(res);
      }
      await new Promise(r => setTimeout(r, Math.min(fail.delay, 5000)));
      return genericError(res);
    }

    // Account not verified — record success to reset counter, return specific error
    if (row[10] === 0) {
      recordSuccess(phone);
      return res.status(403).json({ error: 'Please verify your account before logging in', code: 'UNVERIFIED' });
    }

    // Success — reset counter before issuing token
    recordSuccess(phone);

    const { token } = signTokenWithJti(row[0]);
    const user = userFromRow(row);

    res.json({ token, user });
  } catch (err) {
    console.error('[auth/login]', err);
    res.status(500).json({ error: 'Login failed' });
  }
});

// ─── Forgot Password ─────────────────────────────────────────────────
// Unified handler: accepts phone OR email as identifier

// POST /api/auth/forgot-password
router.post('/forgot-password', otpLimiter, validate(forgotPassword), async (req, res) => {
  try {
    const { phone, email } = res.locals.parsedBody;
    const identifier = email || phone;

    const db = await getDb();

    // Find user by phone or email
    const byPhone = db.exec('SELECT id, name, email FROM users WHERE phone = ?', [phone || '']);
    const byEmail = db.exec('SELECT id, name, email FROM users WHERE email = ?', [email || '']);
    const userRow = byPhone.length > 0 && byPhone[0].values.length > 0
      ? byPhone[0].values[0]
      : byEmail.length > 0 && byEmail[0].values.length > 0
        ? byEmail[0].values[0]
        : null;

    const userName = userRow ? userRow[1] : 'User';
    const userEmail = userRow ? userRow[2] : (email || null);
    const isEmailFlow = !!email;

    // Always return success for security (don't reveal if account exists)
    if (!userRow) {
      return res.json({ message: 'If an account exists, an OTP has been sent' });
    }

    deleteExpiredOtps(db);

    const otpType = isEmailFlow ? 'forgot_password_email' : 'forgot_password';
    db.run('DELETE FROM otp_codes WHERE phone = ? AND type = ?', [identifier, otpType]);

    const code = generateOTP();
    const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000)
      .toISOString()
      .replace('T', ' ')
      .slice(0, 19);

    db.run(
      'INSERT INTO otp_codes (phone, code, type, expires_at) VALUES (?, ?, ?, ?)',
      [identifier, code, otpType, expiresAt]
    );

    // Send email via Resend for email-based flow — fire and forget
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
    if (IS_DEV) response.testOtpCode = code; // NEVER exposed in production
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
    deleteExpiredOtps(db);

    // Check both OTP types
    const result = db.exec(
      'SELECT id, attempts FROM otp_codes WHERE phone = ? AND code = ? AND type IN (?, ?) ORDER BY id DESC LIMIT 1',
      [identifier, code, 'forgot_password', 'forgot_password_email']
    );

    if (result.length === 0 || result[0].values.length === 0) {
      return res.status(401).json({ error: 'Invalid or expired OTP' });
    }

    const [otpId, attempts] = result[0].values[0];
    if (attempts >= 5) {
      db.run('DELETE FROM otp_codes WHERE id = ?', [otpId]);
      return res.status(401).json({ error: 'Too many failed attempts. Please request a new OTP.' });
    }

    // Increment attempts counter on wrong OTP
    db.run('UPDATE otp_codes SET attempts = attempts + 1 WHERE id = ?', [otpId]);

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
    deleteExpiredOtps(db);

    const result = db.exec(
      'SELECT id, attempts FROM otp_codes WHERE phone = ? AND code = ? AND type IN (?, ?) ORDER BY id DESC LIMIT 1',
      [identifier, code, 'forgot_password', 'forgot_password_email']
    );

    if (result.length === 0 || result[0].values.length === 0) {
      return res.status(401).json({ error: 'Invalid or expired OTP' });
    }

    const [otpId, attempts] = result[0].values[0];
    if (attempts >= 5) {
      db.run('DELETE FROM otp_codes WHERE id = ?', [otpId]);
      return res.status(401).json({ error: 'Too many failed attempts. Please request a new OTP.' });
    }

    // Increment attempts counter on wrong OTP
    db.run('UPDATE otp_codes SET attempts = attempts + 1 WHERE id = ?', [otpId]);

    // Find user by phone or email
    const byPhone = db.exec('SELECT id FROM users WHERE phone = ?', [phone || '']);
    const byEmail = db.exec('SELECT id FROM users WHERE email = ?', [email || '']);
    const userResult = byPhone.length > 0 && byPhone[0].values.length > 0
      ? byPhone
      : byEmail;

    if (userResult.length === 0 || userResult[0].values.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    const userId = userResult[0].values[0][0];

    // Update password
    const passwordHash = await hashPassword(newPassword);
    db.run('UPDATE users SET password_hash = ?, updated_at = datetime("now") WHERE id = ?', [passwordHash, userId]);
    db.run('DELETE FROM otp_codes WHERE id = ?', [otpId]);

    res.json({ message: 'Password reset successfully. Please log in with your new password.' });
  } catch (err) {
    console.error('[auth/forgot-password/reset]', err);
    res.status(500).json({ error: 'Password reset failed' });
  }
});

// POST /api/auth/verify-reset-otp — alias for /forgot-password/verify (email-based)
router.post('/verify-reset-otp', otpLimiter, async (req, res) => {
  req.url = '/forgot-password/verify';
  return router(req, res);
});

// POST /api/auth/resend-reset-otp — resend OTP for password reset
router.post('/resend-reset-otp', otpLimiter, async (req, res) => {
  req.url = '/forgot-password';
  return router(req, res);
});

// POST /api/auth/reset-password — alias for /forgot-password/reset (email-based)
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

    if (name !== undefined) {
      updates.push('name = ?');
      values.push(name.trim());
    }

    if (bio !== undefined) {
      updates.push('bio = ?');
      values.push(bio?.trim() || null);
    }

    updates.push('updated_at = datetime("now")');
    values.push(req.userId);

    db.run(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, values);
    save();

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
    try {
      buffer = Buffer.from(base64Data, 'base64');
    } catch {
      return res.status(400).json({ error: 'Invalid base64 image data' });
    }

    if (buffer.length > 5 * 1024 * 1024) {
      return res.status(400).json({ error: 'Image too large (max 5MB)' });
    }

    const mime = req.body.mime || 'image/jpeg';
    const ext = mime === 'image/png' ? 'png' : 'jpg';
    const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
    const storedFilename = `avatar_${req.userId}_${Date.now()}.${ext}`;

    const avatarsDir = path.join(__dirname, '..', 'uploads', 'avatars');
    if (!fs.existsSync(avatarsDir)) {
      fs.mkdirSync(avatarsDir, { recursive: true });
    }

    fs.writeFileSync(path.join(avatarsDir, storedFilename), buffer);
    const avatarUrl = `/uploads/avatars/${storedFilename}`;

    // Update the user's avatar_url in the DB
    const db = await getDb();
    db.run('UPDATE users SET avatar_url = ?, updated_at = datetime("now") WHERE id = ?', [avatarUrl, req.userId]);
    save();

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
    db.run('UPDATE users SET role = ?, updated_at = datetime("now") WHERE id = ?', [role, req.userId]);
    save();

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
    // Revoke this token by adding its JTI to the blocklist
    if (req.tokenJti && req.tokenExp) {
      const expiresAt = new Date(req.tokenExp * 1000).toISOString();
      await addToBlocklist(req.tokenJti, expiresAt);
    }
    res.json({ message: 'Logged out successfully' });
  } catch (err) {
    console.error('[auth/logout]', err);
    // Still return success — client will clear token anyway
    res.json({ message: 'Logged out successfully' });
  }
});

// ─── Utility ─────────────────────────────────────────────────────────

function maskPhone(phone) {
  if (!phone || phone.length < 4) return phone;
  return phone.slice(0, 3) + '****' + phone.slice(-3);
}

module.exports = router;
