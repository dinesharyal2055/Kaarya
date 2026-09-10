/**
 * Push notification routes — FCM token registration and management
 */
const express = require('express');
const { getDb, save, usePostgres } = require('../db');
const { requireAuth } = require('../middleware/auth');
const { storeToken, removeAllTokensForUser, fcmReady } = require('../fcm');
const { validate, registerToken, unregisterToken } = require('../middleware/validate');

const router = express.Router();

// POST /api/push/register
router.post('/register', requireAuth, validate(registerToken), async (req, res) => {
  try {
    const { token } = res.locals.parsedBody;
    const userId = req.userId;
    await storeToken(userId, token.trim());
    if (!usePostgres) save();
    res.json({ message: 'Token registered', fcmEnabled: fcmReady });
  } catch (err) {
    console.error('[/api/push/register]', err);
    res.status(500).json({ error: 'Failed to register push token' });
  }
});

// DELETE /api/push/unregister
router.delete('/unregister', requireAuth, validate(unregisterToken), async (req, res) => {
  try {
    const { token } = res.locals.parsedBody;
    const userId = req.userId;

    if (token && typeof token === 'string') {
      const db = await getDb();
      if (usePostgres) {
        await db.query('DELETE FROM fcm_tokens WHERE user_id = $1 AND token = $2', [userId, token]);
      } else {
        db.run('DELETE FROM fcm_tokens WHERE user_id = ? AND token = ?', [userId, token]);
      }
    } else {
      await removeAllTokensForUser(userId);
    }

    if (!usePostgres) save();
    res.json({ message: 'Token unregistered' });
  } catch (err) {
    console.error('[/api/push/unregister]', err);
    res.status(500).json({ error: 'Failed to unregister push token' });
  }
});

// GET /api/push/status
router.get('/status', (req, res) => {
  res.json({ fcmEnabled: fcmReady });
});

module.exports = router;