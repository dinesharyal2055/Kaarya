// Diagnostic: Check DATABASE_URL at the very start
if (process.env.DATABASE_URL) {
  const url = process.env.DATABASE_URL;
  const protocol = url.split(':')[0];
  console.log(`[diagnostic] DATABASE_URL is SET at process startup (protocol: ${protocol}://)`);
} else {
  console.log('[diagnostic] DATABASE_URL is NOT SET at process startup');
}

// Load .env in development
try { require('dotenv').config(); } catch (_) {}
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');

// Diagnostic: Check DATABASE_URL at the very start
if (process.env.DATABASE_URL) {
  const url = process.env.DATABASE_URL;
  const protocol = url.split(':')[0];
  console.log(`[diagnostic] DATABASE_URL is SET at process startup (protocol: ${protocol}://)`);
} else {
  console.log('[diagnostic] DATABASE_URL is NOT SET at process startup');
}

// Load .env in development
try { require('dotenv').config(); } catch (_) {}

const { getDb } = require('./db');

const app = express();
const PORT = Number(process.env.PORT) || 5000;

// ── CORS ──────────────────────────────────────────────────────────────────────
// Restrict to allowed origins. In production the variable is required.
// In development, allow localhost variants.
function getCorsOptions() {
  const allowed = process.env.ALLOWED_ORIGINS;
  if (process.env.NODE_ENV === 'production') {
    if (!allowed) {
      console.warn('[cors] WARNING: ALLOWED_ORIGINS not set — blocking all cross-origin requests.');
      return { origin: false };
    }
    const origins = allowed.split(',').map((o) => o.trim());
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
  if (allowed) {
    // Also honour the env var in dev so testers can add extra origins
    allowed.split(',').forEach((o) => devOrigins.push(o.trim()));
  }
  return { origin: devOrigins, credentials: false };
}

app.use(helmet({
  // Disable Content-Security-Policy — this is a JSON API, not a website
  contentSecurityPolicy: false,
}));

app.use(cors(getCorsOptions()));
app.use(express.json({ limit: '2mb' })); // larger limit for base64 image uploads

// Serve uploaded files
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Route placeholders — filled in by later tasks
let authRoutes, jobsRoutes, offersRoutes, conversationsRoutes, verificationRoutes, adminRoutes, notificationsRoutes, reviewsRoutes, pushRoutes;

try { authRoutes = require('./routes/auth'); } catch (e) { authRoutes = express.Router(); }
try { jobsRoutes = require('./routes/jobs'); } catch (e) { jobsRoutes = express.Router(); }
try { offersRoutes = require('./routes/offers'); } catch (e) { offersRoutes = express.Router(); }
try { conversationsRoutes = require('./routes/conversations'); } catch (e) { conversationsRoutes = express.Router(); }
try { verificationRoutes = require('./routes/verification'); } catch (e) { verificationRoutes = express.Router(); }
try { adminRoutes = require('./routes/admin'); } catch (e) { adminRoutes = express.Router(); }
try { notificationsRoutes = require('./routes/notifications'); } catch (e) { notificationsRoutes = express.Router(); }
try { reviewsRoutes = require('./routes/reviews'); } catch (e) { reviewsRoutes = express.Router(); }
try { pushRoutes = require('./routes/push'); } catch (e) { pushRoutes = express.Router(); }

app.use('/api/auth', authRoutes);
app.use('/api/jobs', jobsRoutes);
app.use('/api/offers', offersRoutes);
app.use('/api/conversations', conversationsRoutes);
app.use('/api/verification', verificationRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/reviews', reviewsRoutes);
app.use('/api/push', pushRoutes);

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
