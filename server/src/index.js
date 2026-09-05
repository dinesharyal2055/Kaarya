const express = require('express');
const cors = require('cors');
const path = require('path');
const { getDb } = require('./db');

const app = express();
const PORT = 5000;

// Middleware
app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '20mb' })); // larger limit for base64 image uploads

// Serve uploaded files
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Route placeholders — filled in by later tasks
let authRoutes, jobsRoutes, offersRoutes, conversationsRoutes, verificationRoutes, adminRoutes, notificationsRoutes, reviewsRoutes;

try { authRoutes = require('./routes/auth'); } catch (e) { authRoutes = express.Router(); }
try { jobsRoutes = require('./routes/jobs'); } catch (e) { jobsRoutes = express.Router(); }
try { offersRoutes = require('./routes/offers'); } catch (e) { offersRoutes = express.Router(); }
try { conversationsRoutes = require('./routes/conversations'); } catch (e) { conversationsRoutes = express.Router(); }
try { verificationRoutes = require('./routes/verification'); } catch (e) { verificationRoutes = express.Router(); }
try { adminRoutes = require('./routes/admin'); } catch (e) { adminRoutes = express.Router(); }
try { notificationsRoutes = require('./routes/notifications'); } catch (e) { notificationsRoutes = express.Router(); }
try { reviewsRoutes = require('./routes/reviews'); } catch (e) { reviewsRoutes = express.Router(); }

app.use('/api/auth', authRoutes);
app.use('/api/jobs', jobsRoutes);
app.use('/api/offers', offersRoutes);
app.use('/api/conversations', conversationsRoutes);
app.use('/api/verification', verificationRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/reviews', reviewsRoutes);

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
  await getDb(); // initialise DB (schema + seed)
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
