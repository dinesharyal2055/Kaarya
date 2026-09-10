const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

// Load .env in development (no-op if vars are already set)
try { require('dotenv').config(); } catch (_) {}

/**
 * JWT secret — MUST be set via JWT_SECRET env var in ALL environments.
 * Server fails fast at startup if not provided.
 */
if (!process.env.JWT_SECRET) {
  throw new Error('FATAL: JWT_SECRET environment variable is not set. Aborting startup.');
}
const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRY = process.env.JWT_EXPIRY || '7d';
const BCRYPT_ROUNDS = Number(process.env.BCRYPT_ROUNDS) || 10;

// Lazy import to avoid circular dependency — db.js is only needed at runtime
let _getDb = null;
function getDb() {
  if (!_getDb) _getDb = require('../db').getDb;
  return _getDb();
}

/**
 * Add a token's JTI to the blocklist (call on logout).
 * Tokens expire naturally but we also track them until expiry.
 */
async function addToBlocklist(jti, expiresAt) {
  const db = await getDb();
  const usePostgres = !!process.env.DATABASE_URL;

  if (usePostgres) {
    await db.query(
      'INSERT INTO jwt_blocklist (jti, expires_at) VALUES ($1, $2) ON CONFLICT (jti) DO NOTHING',
      [jti, expiresAt]
    );
    // Cleanup expired entries periodically (cheap, runs on each logout)
    await db.query('DELETE FROM jwt_blocklist WHERE expires_at < NOW()');
  } else {
    db.run(
      'INSERT OR IGNORE INTO jwt_blocklist (jti, expires_at) VALUES (?, ?)',
      [jti, expiresAt]
    );
    // Cleanup expired entries periodically (cheap, runs on each logout)
    db.run('DELETE FROM jwt_blocklist WHERE expires_at < datetime("now")');
  }
}

/**
 * Check if a token JTI is in the blocklist.
 */
async function isBlocked(jti) {
  const db = await getDb();
  const usePostgres = !!process.env.DATABASE_URL;

  if (usePostgres) {
    const res = await db.query(
      'SELECT 1 FROM jwt_blocklist WHERE jti = $1 AND expires_at > NOW() LIMIT 1',
      [jti]
    );
    return res.rowCount > 0;
  } else {
    const result = db.exec(
      'SELECT 1 FROM jwt_blocklist WHERE jti = ? AND expires_at > datetime("now") LIMIT 1',
      [jti]
    );
    return result.length > 0 && result[0].values.length > 0;
  }
}

/**
 * Middleware: verify JWT and check blocklist.
 * Adds req.userId on success.
 * Note: uses Promise.resolve().then() to ensure async errors propagate to Express error handler.
 */
function requireAuth(req, res, next) {
  Promise.resolve().then(async () => {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized — no token provided' });
    }
    const token = header.slice(7);
    try {
      const payload = jwt.verify(token, JWT_SECRET);

      // Check blocklist for this token's JTI
      if (payload.jti) {
        const blocked = await isBlocked(payload.jti);
        if (blocked) {
          return res.status(401).json({ error: 'Token has been revoked' });
        }
      }

      req.userId = payload.userId;
      req.tokenJti = payload.jti;
      req.tokenExp = payload.exp;
      next();
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        return res.status(401).json({ error: 'Token has expired' });
      }
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
  }).catch(next); // forward unexpected errors to Express error handler
}

/**
 * Sign a JWT with a unique JTI (used for revocation).
 * The JTI is stored in the blocklist on logout.
 */
function signToken(userId) {
  const jti = crypto.randomUUID();
  return jwt.sign({ userId, jti }, JWT_SECRET, { expiresIn: JWT_EXPIRY });
}

/**
 * Sync version of signToken that returns { token, jti }.
 */
function signTokenWithJti(userId) {
  const jti = crypto.randomUUID();
  const token = jwt.sign({ userId, jti }, JWT_SECRET, { expiresIn: JWT_EXPIRY });
  return { token, jti };
}

async function hashPassword(password) {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

async function verifyPassword(password, hash) {
  return bcrypt.compare(password, hash);
}

module.exports = { requireAuth, signToken, signTokenWithJti, addToBlocklist, hashPassword, verifyPassword, JWT_SECRET };
