const { getDb } = require('../db');

async function requireAdmin(req, res, next) {
  try {
    const db = await getDb();
    const usePostgres = !!process.env.DATABASE_URL;
    let isAdmin = false;
    if (usePostgres) {
      const resAdmin = await db.query('SELECT is_admin FROM users WHERE id = $1', [req.userId]);
      if (resAdmin.rowCount > 0) {
        isAdmin = resAdmin.rows[0].is_admin;
      }
    } else {
      const result = db.exec('SELECT is_admin FROM users WHERE id = ?', [req.userId]);
      if (result.length > 0 && result[0].values.length > 0) {
        isAdmin = !!result[0].values[0][0];
      }
    }
    if (!isAdmin) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    next();
  } catch (err) {
    console.error('[adminGuard] Error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

module.exports = { requireAdmin };