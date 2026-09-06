const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

// Load .env in development (no-op if vars are already set)
try { require('dotenv').config(); } catch (_) {}

/**
 * JWT secret — MUST be set via JWT_SECRET env var in production.
 * Falls back to a dev-only string only when NODE_ENV !== 'production'.
 */
function getJwtSecret() {
  if (process.env.NODE_ENV === 'production') {
    if (!process.env.JWT_SECRET) {
      throw new Error('FATAL: JWT_SECRET environment variable is not set in production. Aborting startup.');
    }
    return process.env.JWT_SECRET;
  }
  // Development fallback — never used in production
  return process.env.JWT_SECRET || '***REMOVED***';
}

const JWT_SECRET = getJwtSecret();
const JWT_EXPIRY = process.env.JWT_EXPIRY || '7d';
const BCRYPT_ROUNDS = Number(process.env.BCRYPT_ROUNDS) || 10;

function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized — no token provided' });
  }
  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.userId = payload.userId;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

function signToken(userId) {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: JWT_EXPIRY });
}

async function hashPassword(password) {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

async function verifyPassword(password, hash) {
  return bcrypt.compare(password, hash);
}

module.exports = { requireAuth, signToken, hashPassword, verifyPassword, JWT_SECRET };
