/**
 * Push Notification Service — sends via the Expo Push Service.
 *
 * The mobile app registers an Expo push token (ExpoPushToken[...]) with this
 * server (POST /api/push/register). Delivery goes through Expo's push API
 * (https://exp.host), which fans out to APNs (iOS) and FCM (Android) using the
 * project's EAS/Expo credentials. No native Firebase tokens are involved and
 * Firebase is never used for anything else (no Firebase Authentication).
 *
 * REQUIRED CONFIGURATION (no credentials live in this repo):
 *   EXPO_ACCESS_TOKEN — Expo account access token (expo.dev → account →
 *   settings → access tokens), sent as "Authorization: Bearer <token>".
 *
 * Without the token the service logs a warning and skips sending; the app and
 * the notification inbox remain fully functional.
 */

const { getDb, save, usePostgres } = require('./db');
const { getClient } = require('./db-pg');

// Load env
try { require('dotenv').config(); } catch (_) {}

const EXPO_PUSH_ENDPOINT = 'https://exp.host/--/api/v2/push/send';

/** Whether the Expo push service is configured (EXPO_ACCESS_TOKEN present). */
function isPushReady() {
  return Boolean(process.env.EXPO_ACCESS_TOKEN);
}

// Snapshot kept for existing /status and register responses (fcmEnabled).
const fcmReady = isPushReady();

if (!fcmReady) {
  console.warn(
    '[push] ⚠️  EXPO_ACCESS_TOKEN not set. Push notifications are DISABLED.\n'
    + '         Set EXPO_ACCESS_TOKEN to enable sending via the Expo Push Service.'
  );
}

/**
 * Send a push notification to a single Expo push token.
 * Silently skips if the service is not configured or the token is not an
 * Expo push token (no error thrown, no external calls made).
 *
 * @param {string} token — Expo push token (ExpoPushToken[...])
 * @param {object} payload
 * @param {string} payload.title — Notification title
 * @param {string} payload.body — Notification body text
 * @param {object} [payload.data] — Optional arbitrary data payload (passed to the app)
 * @returns {Promise<boolean>} true if accepted by Expo, false if skipped/failed
 */
async function sendPushNotification(token, { title, body, data = {} }) {
  if (!isPushReady()) return false;
  if (typeof token !== 'string' || !token.startsWith('ExpoPushToken[')) {
    return false;
  }

  const message = {
    to: token,
    title,
    body,
    sound: 'default',
    badge: 1,
    priority: 'high',
    channelId: 'kaarya_default',
    data: Object.fromEntries(
      Object.entries(data).map(([k, v]) => [k, String(v == null ? '' : v)])
    ),
  };

  try {
    const res = await fetch(EXPO_PUSH_ENDPOINT, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.EXPO_ACCESS_TOKEN}`,
      },
      body: JSON.stringify([message]),
    });

    if (res.status === 401 || res.status === 403) {
      console.error('[push] ❌ Expo push authorization rejected (check EXPO_ACCESS_TOKEN)');
      return false;
    }

    if (!res.ok) {
      console.error(`[push] ❌ Expo push HTTP ${res.status}`);
      return false;
    }

    const tickets = await res.json();
    const ticket = Array.isArray(tickets) ? tickets[0] : tickets;

    if (ticket && ticket.status === 'error') {
      const errorCode = ticket.details && ticket.details.error;
      if (errorCode === 'DeviceNotRegistered') {
        // Token no longer reachable — remove it so we stop sending to it.
        console.warn(`[push] ⚠️  Stale token detected: ${token.slice(0, 20)}… — removing from DB`);
        await removeToken(token).catch(() => {});
      } else {
        console.error(`[push] ❌ Message failed: ${ticket.message} (${errorCode || 'unknown'})`);
      }
      return false;
    }

    console.log(`[push] ✅ Push sent to token ${token.slice(0, 20)}…`);
    return true;
  } catch (err) {
    console.error(`[push] ❌ Failed to send push: ${err.message}`);
    return false;
  }
}

/**
 * Send a push notification to ALL active tokens for a given user ID.
 * If any token fails it is silently removed.
 *
 * @param {number|string} userId
 * @param {object} payload — { title, body, data }
 * @returns {Promise<number>} number of successfully sent notifications
 */
async function sendToUser(userId, payload) {
  if (!isPushReady()) return 0;

  const db = await getDb();

  if (usePostgres) {
    const client = await getClient();
    try {
      const result = await client.query(
        'SELECT token FROM fcm_tokens WHERE user_id = $1 AND expires_at > NOW()',
        [userId]
      );
      let sent = 0;
      for (const row of result.rows) {
        const ok = await sendPushNotification(row.token, payload);
        if (ok) sent++;
      }
      return sent;
    } finally {
      client.release();
    }
  } else {
    // SQLite fallback
    const result = db.exec(
      'SELECT token FROM fcm_tokens WHERE user_id = ? AND expires_at > datetime("now")',
      [userId]
    );

    let sent = 0;
    for (const [token] of result[0].values) {
      const ok = await sendPushNotification(token, payload);
      if (ok) sent++;
    }
    return sent;
  }
}

/**
 * Store (or refresh) a push registration token for a user.
 *
 * @param {number|string} userId
 * @param {string} token — Expo push token from the app
 */
async function storeToken(userId, token) {
  const db = await getDb();
  const now = new Date().toISOString();
  // Tokens expire after 30 days; refresh on each register call
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

  if (usePostgres) {
    const client = await getClient();
    try {
      await client.query(
        'INSERT INTO fcm_tokens (user_id, token, created_at, expires_at) VALUES ($1, $2, $3, $4) ON CONFLICT (user_id, token) DO UPDATE SET created_at = EXCLUDED.created_at, expires_at = EXCLUDED.expires_at',
        [userId, token, now, expiresAt]
      );
      // Also update the user's fcm_token column for convenience
      await client.query('UPDATE users SET fcm_token = $1 WHERE id = $2', [token, userId]);
    } finally {
      client.release();
    }
  } else {
    // SQLite
    db.run(
      `INSERT OR REPLACE INTO fcm_tokens (user_id, token, created_at, expires_at)
       VALUES (?, ?, ?, ?)`,
      [userId, token, now, expiresAt]
    );
    db.run('UPDATE users SET fcm_token = ? WHERE id = ?', [token, userId]);
  }
}

/**
 * Remove a specific push token (e.g., after it goes stale).
 *
 * @param {string} token
 */
async function removeToken(token) {
  const db = await getDb();
  if (usePostgres) {
    const client = await getClient();
    try {
      await client.query('DELETE FROM fcm_tokens WHERE token = $1', [token]);
    } finally {
      client.release();
    }
  } else {
    db.run('DELETE FROM fcm_tokens WHERE token = ?', [token]);
  }
}

/**
 * Remove all push tokens for a user (e.g., on logout).
 *
 * @param {number|string} userId
 */
async function removeAllTokensForUser(userId) {
  const db = await getDb();
  if (usePostgres) {
    const client = await getClient();
    try {
      await client.query('DELETE FROM fcm_tokens WHERE user_id = $1', [userId]);
    } finally {
      client.release();
    }
  } else {
    db.run('DELETE FROM fcm_tokens WHERE user_id = ?', [userId]);
  }
}

module.exports = {
  fcmReady,
  sendPushNotification,
  sendToUser,
  storeToken,
  removeToken,
  removeAllTokensForUser,
};