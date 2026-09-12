// Remove diagnostic blocks and keep only one .env load
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');

// Load .env in development
try { require('dotenv').config(); } catch (_) {}

const { getDb } = require('./db');
const { createVerificationDownloadHandler } = require('./storage');

const app = express();
const PORT = Number(process.env.PORT) || 5000;

// ── CORS ──────────────────────────────────────────────────────────────────────
// Restrict to allowed origins. Never '*'.
// Production: always allow the deployed Super Admin web app(s), merged with any
// explicit ALLOWED_ORIGINS configured via environment. If neither yields an
// allowed origin, block all cross-origin requests.
// Development: allow localhost variants plus all paths removed at deploy time.
const ADMIN_WEB_ORIGINS = ['https://kaarya-mu.vercel.app'];

function getCorsOptions() {
  const allowed = process.env.ALLOWED_ORIGINS;
  const extraOrigins = allowed
    ? allowed.split(',').map((o) => o.trim()).filter((o) => o && o !== '*')
    : [];

  if (process.env.NODE_ENV === 'production') {
    const origins = [...new Set([...ADMIN_WEB_ORIGINS, ...extraOrigins])];
    if (origins.length === 0) {
      console.warn('[cors] WARNING: no allowed origins configured — blocking all cross-origin requests.');
      return { origin: false };
    }
    return { origin: origins, credentials: true };
  }
  // Development: allow localhost, file://, and the Expo dev server
  const devOrigins = [
    'http://localhost:3000',
    'http://localhost:8081',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:8081',
    'exp://localhost:8081',
    'exp://127.0.0.1:8081',
  ];
  extraOrigins.forEach((o) => {
    if (!devOrigins.includes(o)) devOrigins.push(o);
  });
  return { origin: devOrigins, credentials: false };
}

app.use(helmet({
  // Disable Content-Security-Policy — this is a JSON API, not a website
  contentSecurityPolicy: false,
}));

app.use(cors(getCorsOptions()));
app.use(express.json({ limit: '12mb' })); // larger limit for base64 image uploads (verification route enforces its own 10MB decoded check)

// Serve verification documents via the storage proxy (R2 in production, local
// filesystem in development). Mounted BEFORE the static folder so documents are
// fetched securely from private R2 instead of the public uploads directory.
app.get('/uploads/verification/:filename', createVerificationDownloadHandler());

// Serve uploaded files (job photos, avatars, legacy local files)
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Route placeholders — filled in by later tasks
let authRoutes, jobsRoutes, offersRoutes, conversationsRoutes, verificationRoutes, adminRoutes, notificationsRoutes, reviewsRoutes, pushRoutes, devRoutes;

try { authRoutes = require('./routes/auth'); } catch (e) { authRoutes = express.Router(); }
try { jobsRoutes = require('./routes/jobs'); } catch (e) { jobsRoutes = express.Router(); }
try { offersRoutes = require('./routes/offers'); } catch (e) { offersRoutes = express.Router(); }
try { conversationsRoutes = require('./routes/conversations'); } catch (e) { conversationsRoutes = express.Router(); }
try { verificationRoutes = require('./routes/verification'); } catch (e) { verificationRoutes = express.Router(); }
try { adminRoutes = require('./routes/admin'); } catch (e) { adminRoutes = express.Router(); }
try { notificationsRoutes = require('./routes/notifications'); } catch (e) { notificationsRoutes = express.Router(); }
try { reviewsRoutes = require('./routes/reviews'); } catch (e) { reviewsRoutes = express.Router(); }
try { pushRoutes = require('./routes/push'); } catch (e) { pushRoutes = express.Router(); }
try { devRoutes = require('./routes/demo').router; } catch (e) { devRoutes = express.Router(); }

app.use('/api/auth', authRoutes);
app.use('/api/jobs', jobsRoutes);
app.use('/api/offers', offersRoutes);
app.use('/api/conversations', conversationsRoutes);
app.use('/api/verification', verificationRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/reviews', reviewsRoutes);
app.use('/api/push', pushRoutes);
app.use('/api/dev', devRoutes);

// Global error handler
app.use((err, req, res, next) => {
  console.error('[error]', err.message);
  res.status(500).json({ error: 'Internal server error' });
});

const BANNER = `
╔═══════════════════════════════════╗
║       Kaarya API Server v1.0.0     ║
║       http://localhost:${PORT}        ║
╚═══════════════════════════════════╝
`;

async function start() {
  if (process.env.DATABASE_URL) {
    console.log('[server] DATABASE_URL detected — using PostgreSQL driver.');
    try {
      const dbPg = require('./db-pg');
      await dbPg.query('SELECT 1');
      console.log('[server] ✅ PostgreSQL connectivity confirmed.');
    } catch (err) {
      console.error('[server] ❌ PostgreSQL connection failed:', err.message);
      process.exit(1);
    }
  } else {
    console.log('[server] No DATABASE_URL set — using local SQLite/sql.js driver.');
    await getDb(); // initialise SQLite DB (schema + seed)
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(BANNER);
    console.log('[server] Ready and listening on http://0.0.0.0:' + PORT);
  });
}

start().catch((err) => {
  console.error('[server] Failed to start:', err);
  process.exit(1);
});

module.exports = app;
