/**
 * Firebase Cloud Messaging (FCM) — Push Notification Service
 *
 * SETUP REQUIRED before use:
 * 1. Go to https://console.firebase.google.com/ and create a project (or use an existing one)
 * 2. Generate a service account key:
 *    - Project Settings → Service Accounts → Generate new private key
 *    - Save the JSON file as `firebase-service-account.json` in the server/src/ folder
 * 3. Enable Cloud Messaging API:
 *    - APIs & Services → Library → search "Firebase Cloud Messaging API" → Enable
 *
 * ENV VARIABLE (optional alternative to the JSON file):
 *   GOOGLE_APPLICATION_CREDENTIALS=./src/serviceAccountKey.json
 *   # or set the path in the FCM_SERVICE_ACCOUNT_KEY env var below
 *
 * Without setup the app will log a warning but continue to function normally
 * (no push notifications will be sent until credentials are configured).
 */

const admin = require('firebase-admin');
const { getDb } = require('./db');

/** Path to the Firebase service account key JSON file */
const SERVICE_ACCOUNT_PATH = process.env.FCM_SERVICE_ACCOUNT_PATH
  || process.env.GOOGLE_APPLICATION_CREDENTIALS
  || require('path').join(__dirname, 'firebase-service-account.json');

let fcmApp = null;
let fcmReady = false;

try {
  // Check if a service account file exists
  const fs = require('fs');
  if (fs.existsSync(SERVICE_ACCOUNT_PATH)) {
    const serviceAccount = require(SERVICE_ACCOUNT_PATH);

    // Check if default app already initialized
    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
    }
    fcmApp = admin.app();
    fcmReady = true;
    console.log('[fcm] Firebase Admin initialized successfully');
  } else {
    console.warn(
      '[fcm] ⚠️  Firebase service account key not found at:\n'
      + `         ${SERVICE_ACCOUNT_PATH}\n`
      + '         Push notifications are DISABLED until you add the JSON file.\n'
      + '         See server/src/fcm.js for setup instructions.'
    );
  }
} catch (err) {
  console.warn('[fcm] ⚠️  Failed to initialize Firebase Admin:', err.message);
  console.warn('[fcm]    Push notifications will be disabled.');
}

/**
 * Send a push notification to a single FCM registration token.
 * Silently skips if FCM is not configured (no error thrown).
 *
 * @param {string} token — FCM registration token from the client app
 * @param {object} payload
 * @param {string} payload.title — Notification title
 * @param {string} payload.body — Notification body text
 * @param {object} [payload.data] — Optional arbitrary data payload (passed to the app)
 * @returns {Promise<boolean>} true if sent, false if skipped/failed
 */
async function sendPushNotification(token, { title, body, data = {} }) {
  if (!fcmReady) return false;

  try {
    const message = {
      token,
      notification: { title, body },
      data: {
        // Ensure all values are strings (FCM requirement)
        ...Object.fromEntries(
          Object.entries(data).map(([k, v]) => [k, String(v ?? '')])
        ),
      },
      android: {
        notification: {
          channelId: 'kaarya_default',
          priority: 'high',
          defaultSound: true,
          defaultVibrateTimings: true,
        },
      },
      apns: {
        payload: {
          aps: {
            badge: 1,
            sound: 'default',
            'mutable-content': 1,
          },
        },
      },
    };

    await admin.messaging().send(message);
    console.log(`[fcm] ✅ Push sent to token ${token.slice(0, 12)}…`);
    return true;
  } catch (err) {
    if (err.code === 'messaging/registration-token-not-registered'
        || err.code === 'messaging/invalid-argument') {
      // Token is stale/invalid — mark it for removal
      console.warn(`[fcm] ⚠️  Stale token detected: ${token.slice(0, 12)}… — removing from DB`);
      await removeToken(token).catch(() => {});
    } else {
      console.error(`[fcm] ❌ Failed to send push: ${err.message}`);
    }
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
  if (!fcmReady) return 0;

  const db = await getDb();
  const result = db.exec(
    'SELECT token FROM fcm_tokens WHERE user_id = ? AND expires_at > datetime("now")',
    [userId]
  );

  if (!result.length || !result[0].values.length) return 0;

  let sent = 0;
  for (const [token] of result[0].values) {
    const ok = await sendPushNotification(token, payload);
    if (ok) sent++;
  }
  return sent;
}

/**
 * Store (or refresh) an FCM registration token for a user.
 *
 * @param {number|string} userId
 * @param {string} token — FCM registration token from Expo/FCM
 */
async function storeToken(userId, token) {
  const db = await getDb();
  const now = new Date().toISOString();
  // Tokens expire after 30 days; refresh on each register call
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

  db.run(
    `INSERT OR REPLACE INTO fcm_tokens (user_id, token, created_at, expires_at)
     VALUES (?, ?, ?, ?)`,
    [userId, token, now, expiresAt]
  );

  // Also update the user's fcm_token column for convenience
  db.run('UPDATE users SET fcm_token = ? WHERE id = ?', [token, userId]);
}

/**
 * Remove a specific FCM token (e.g., after it goes stale).
 *
 * @param {string} token
 */
async function removeToken(token) {
  const db = await getDb();
  db.run('DELETE FROM fcm_tokens WHERE token = ?', [token]);
}

/**
 * Remove all FCM tokens for a user (e.g., on logout).
 *
 * @param {number|string} userId
 */
async function removeAllTokensForUser(userId) {
  const db = await getDb();
  db.run('DELETE FROM fcm_tokens WHERE user_id = ?', [userId]);
}

module.exports = {
  fcmReady,
  sendPushNotification,
  sendToUser,
  storeToken,
  removeToken,
  removeAllTokensForUser,
};
