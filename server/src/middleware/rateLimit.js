/**
 * Rate limiting middleware — protects auth endpoints against brute-force attacks.
 *
 * Configuration is read from environment variables so limits are tunable per deployment:
 *
 *   RATE_LIMIT_WINDOW_MS       — sliding window in milliseconds (default: 15 min)
 *   RATE_LIMIT_MAX_AUTH       — max auth attempts per IP per window (default: 10)
 *   RATE_LIMIT_MAX_OTP        — max OTP requests per IP per window (default: 5)
 *   RATE_LIMIT_MAX_REGISTER   — max registration attempts per IP per window (default: 5)
 */

const rateLimit = require('express-rate-limit');
const { ipKeyGenerator } = require('express-rate-limit');

const WINDOW_MS   = Number(process.env.RATE_LIMIT_WINDOW_MS)   || 15 * 60 * 1000; // 15 minutes
const MAX_AUTH    = Number(process.env.RATE_LIMIT_MAX_AUTH)    || 10;
const MAX_OTP     = Number(process.env.RATE_LIMIT_MAX_OTP)     || 5;
const MAX_REGISTER= Number(process.env.RATE_LIMIT_MAX_REGISTER)|| 5;

/**
 * Skips rate limiting when running in development with no env vars set.
 * Set RATE_LIMIT_ENABLED=1 even in dev to enable it.
 */
const skipIfDev = (req) => {
  if (process.env.NODE_ENV !== 'production' && process.env.RATE_LIMIT_ENABLED !== '1') {
    return true; // skip in dev unless explicitly enabled
  }
  return false;
};

/**
 * Login endpoint — stricter limits to slow credential brute-forcing.
 * 10 attempts per 15-minute window per IP.
 */
const loginLimiter = rateLimit({
  windowMs: WINDOW_MS,
  max: MAX_AUTH,
  standardHeaders: true,      // Return RateLimit-* headers
  legacyHeaders: false,
  keyGenerator: (req) => ipKeyGenerator(req) + (req.headers['x-forwarded-for'] ? `:${req.headers['x-forwarded-for'].split(',')[0].trim()}` : ''),
  skip: skipIfDev,
  message: { error: 'Too many login attempts. Please try again after 15 minutes.' },
  statusCode: 429,
});

/**
 * OTP generation — looser than login since OTPs are sent via email
 * (not free to spam), but still limited to prevent enumeration.
 * 5 OTP requests per 15-minute window per IP.
 */
const otpLimiter = rateLimit({
  windowMs: WINDOW_MS,
  max: MAX_OTP,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => ipKeyGenerator(req) + (req.headers['x-forwarded-for'] ? `:${req.headers['x-forwarded-for'].split(',')[0].trim()}` : ''),
  skip: skipIfDev,
  message: { error: 'Too many OTP requests. Please try again after 15 minutes.' },
  statusCode: 429,
});

/**
 * Registration endpoint — prevents mass account creation.
 * 5 registrations per 15-minute window per IP.
 */
const registerLimiter = rateLimit({
  windowMs: WINDOW_MS,
  max: MAX_REGISTER,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => ipKeyGenerator(req) + (req.headers['x-forwarded-for'] ? `:${req.headers['x-forwarded-for'].split(',')[0].trim()}` : ''),
  skip: skipIfDev,
  message: { error: 'Too many registration attempts. Please try again after 15 minutes.' },
  statusCode: 429,
});

module.exports = { loginLimiter, otpLimiter, registerLimiter };
