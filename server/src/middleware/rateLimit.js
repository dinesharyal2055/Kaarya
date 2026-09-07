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

// Login: tighter 1-minute window
const LOGIN_WINDOW_MS = Number(process.env.RATE_LIMIT_LOGIN_WINDOW_MS) || 60 * 1000; // 1 minute
// OTP / Register: 15-minute window
const WINDOW_MS       = Number(process.env.RATE_LIMIT_WINDOW_MS)       || 15 * 60 * 1000; // 15 minutes
const MAX_AUTH        = Number(process.env.RATE_LIMIT_MAX_AUTH)        || 10;
const MAX_OTP     = Number(process.env.RATE_LIMIT_MAX_OTP)     || 5;
const MAX_REGISTER= Number(process.env.RATE_LIMIT_MAX_REGISTER)|| 5;

/**
 * Skips rate limiting only when explicitly disabled.
 * Set RATE_LIMIT_ENABLED=0 to disable (e.g. load-testing environments).
 * Rate limiting is ON by default in all environments.
 */
const skipIfDev = (req) => {
  if (process.env.RATE_LIMIT_ENABLED === '0') {
    return true; // skip only when explicitly disabled
  }
  return false;
};

/**
 * Login endpoint — stricter limits to slow credential brute-forcing.
 * 10 attempts per 1-minute window per IP.
 */
const loginLimiter = rateLimit({
  windowMs: LOGIN_WINDOW_MS,
  max: MAX_AUTH,
  standardHeaders: true,      // Return RateLimit-* headers
  legacyHeaders: false,
  keyGenerator: (req) => ipKeyGenerator(req) + (req.headers['x-forwarded-for'] ? `:${req.headers['x-forwarded-for'].split(',')[0].trim()}` : ''),
  skip: skipIfDev,
  message: { error: 'Too many requests. Please try again later.' },
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

/**
 * Offers endpoint — prevents spamming job postings with rapid offer submissions.
 * 10 offers per 15-minute window per IP.
 */
const offersLimiter = rateLimit({
  windowMs: WINDOW_MS,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => ipKeyGenerator(req) + (req.headers['x-forwarded-for'] ? `:${req.headers['x-forwarded-for'].split(',')[0].trim()}` : ''),
  skip: skipIfDev,
  message: { error: 'Too many offer submissions. Please try again later.' },
  statusCode: 429,
});

/**
 * Message sending — prevents spam within a single conversation.
 * 10 messages per 1-minute window per IP.
 */
const messagesLimiter = rateLimit({
  windowMs: LOGIN_WINDOW_MS,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => ipKeyGenerator(req) + (req.headers['x-forwarded-for'] ? `:${req.headers['x-forwarded-for'].split(',')[0].trim()}` : ''),
  skip: skipIfDev,
  message: { error: 'Too many messages. Please slow down.' },
  statusCode: 429,
});

module.exports = { loginLimiter, otpLimiter, registerLimiter, offersLimiter, messagesLimiter };
