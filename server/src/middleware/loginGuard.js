/**
 * Login brute-force guard using lru-cache.
 *
 * Tracks failed-attempt counts and lockout state per phone number
 * (not per IP — phone is the account identifier, so we lock the account,
 * not the network address).
 *
 * Rules:
 *   • 5 consecutive failed attempts → 15-minute lockout
 *   • Progressive delay on each failed attempt (1 s × attempt count)
 *   • Counter resets on successful login
 *   • Lockout notification sent via existing sendPasswordReset mailer
 */

const { LRUCache } = require('lru-cache');

// 5 attempts before lockout
const MAX_ATTEMPTS = Number(process.env.LOGIN_GUARD_MAX_ATTEMPTS) || 5;
// 15-minute lockout
const LOCKOUT_MS = Number(process.env.LOGIN_GUARD_LOCKOUT_MS) || 15 * 60 * 1000;

const guard = new LRUCache({ max: 10000 });

/**
 * Retrieve or initialise state for a phone.
 * State shape: { attempts: number, lockedUntil: number | null }
 */
function getState(phone) {
  return guard.get(phone) || { attempts: 0, lockedUntil: null };
}

function setState(phone, state) {
  guard.set(phone, state);
}

/**
 * Returns { allowed: true }  if the login should proceed.
 * Returns { allowed: false, reason: 'locked' | 'delay', ms?: number }
 *   where ms is the remaining lockout duration in ms.
 */
function checkGuard(phone) {
  const state = getState(phone);
  const now = Date.now();

  if (state.lockedUntil !== null && state.lockedUntil > now) {
    return { allowed: false, reason: 'locked', ms: state.lockedUntil - now };
  }

  // Lock has expired — reset state
  if (state.lockedUntil !== null && state.lockedUntil <= now) {
    setState(phone, { attempts: 0, lockedUntil: null });
  }

  return { allowed: true };
}

/**
 * Called on each failed password check.
 * Returns { delay: number } — ms to wait before responding (max 5000 ms).
 */
function recordFailure(phone) {
  const state = getState(phone);
  const now = Date.now();

  // If previously locked but now expired, start fresh
  if (state.lockedUntil !== null && state.lockedUntil <= now) {
    setState(phone, { attempts: 0, lockedUntil: null });
    const fresh = { attempts: 1, lockedUntil: null };
    setState(phone, fresh);
    return { delay: 1000 };
  }

  const attempt = state.attempts + 1;
  const delay = Math.min(attempt * 1000, 5000); // cap at 5 s

  if (attempt >= MAX_ATTEMPTS) {
    const lockedUntil = now + LOCKOUT_MS;
    setState(phone, { attempts: attempt, lockedUntil });
    return { delay, lockout: true, lockedUntil };
  }

  setState(phone, { attempts: attempt, lockedUntil: null });
  return { delay, lockout: false };
}

/** Called on successful login — wipes the counter */
function recordSuccess(phone) {
  setState(phone, { attempts: 0, lockedUntil: null });
}

module.exports = { checkGuard, recordFailure, recordSuccess };
