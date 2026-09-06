/**
 * Push notification routes — FCM token registration and management
 */
const express = require('express');
const { getDb, save } = require('../db');
const { requireAuth } = require('../middleware/auth');
const { storeToken, removeAllTokensForUser, fcmReady } = require('../fcm');

const router = express.Router();

/**
 * POST /api/push/register
 *
 * Register (or refresh) the device's FCM token with the server.
 * Called by the app on login and whenever the FCM token changes.
 *
 * Body: { token: string }
 */
router.post('/register', requireAuth, async (req, res) => {
  try {
    const { token } = req.body;

    if (!token || typeof token !== 'string' || token.trim().length === 0) {
      return res.status(400).json({ error: 'A valid FCM token is required' });
    }

    const userId = req.userId;
    await storeToken(userId, token.trim());
    save();

    res.json({ message: 'Token registered', fcmEnabled: fcmReady });
  } catch (err) {
    console.error('[/api/push/register]', err);
    res.status(500).json({ error: 'Failed to register push token' });
  }
});

/**
 * DELETE /api/push/unregister
 *
 * Unregister the device's FCM token on logout.
 * Called when the user logs out of the app.
 *
 * Body: { token?: string } — if token omitted, removes ALL tokens for this user
 */
router.delete('/unregister', requireAuth, async (req, res) => {
  try {
    const { token } = req.body || {};
    const userId = req.userId;

    if (token && typeof token === 'string') {
      const db = await getDb();
      db.run('DELETE FROM fcm_tokens WHERE user_id = ? AND token = ?', [userId, token]);
    } else {
      await removeAllTokensForUser(userId);
    }

    save();
    res.json({ message: 'Token unregistered' });
  } catch (err) {
    console.error('[/api/push/unregister]', err);
    res.status(500).json({ error: 'Failed to unregister push token' });
  }
});

/**
 * GET /api/push/status
 *
 * Returns whether FCM is configured on the server side.
 * The client can use this to know if push notifications are available.
 */
router.get('/status', (req, res) => {
  res.json({ fcmEnabled: fcmReady });
});

module.exports = router;
