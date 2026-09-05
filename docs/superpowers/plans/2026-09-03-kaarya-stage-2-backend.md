# Stage 2: Real Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the mock Node.js HTTP server with a production-ready Express + SQLite backend that handles real JWT authentication, job CRUD, offers/negotiation, and conversation storage.

**Architecture:** Express.js REST API with SQLite (better-sqlite3 for sync API), JWT for auth tokens, bcrypt for password hashing. No ORM — raw SQL with prepared statements for clarity and performance. CORS enabled for mobile app access.

**Tech Stack:** Node.js, Express 4.x, better-sqlite3, bcryptjs, jsonwebtoken, cors

**Spec:** This plan is the design — no separate spec doc needed for this bounded subsystem.

---

## Global Constraints

- Node.js 18+ (check with `node --version`)
- Server runs on port 5000
- Mobile app expects API at `http://192.168.1.79:5000/api`
- JWT expiry: 7 days
- SQLite file at `server/database.sqlite`
- Passwords hashed with bcrypt (10 rounds)
- All API responses: `{ data: ... }` wrapper or `{ error: string }` on failure
- Mobile already has all API methods defined in `src/lib/api.ts` — server must match those exact paths

---

## File Map

```
server/
├── package.json                          ← npm dependencies
├── src/
│   ├── index.js                         ← Express app entry point, CORS, routes
│   ├── db.js                            ← SQLite connection + schema init
│   ├── routes/
│   │   ├── auth.js                      ← POST /api/auth/login, /register, /logout, GET /me
│   │   ├── jobs.js                      ← GET /api/jobs, POST /api/jobs, GET /api/jobs/:id, PUT /api/jobs/:id/status
│   │   ├── offers.js                    ← POST /api/offers, GET /api/offers/:id, POST /api/offers/:id/accept|reject|withdraw|counter
│   │   └── conversations.js             ← GET /api/conversations, GET /api/conversations/:id/messages, POST /api/conversations/:id/messages
│   └── middleware/
│       └── auth.js                      ← JWT verification middleware → attaches req.userId
└── database.sqlite                      ← auto-created on first run

Mobile (no changes needed — api.ts already has correct paths and shapes):
- src/lib/api.ts                        ← BASE_URL stays as http://192.168.1.79:5000/api
- src/context/AuthContext.tsx           ← works as-is with new server
```

---

## Task 1: Server scaffolding — package.json, db.js, index.js

**Files:**
- Create: `server/package.json`
- Create: `server/src/db.js`
- Create: `server/src/index.js`

**Interfaces:**
- Produces: `db.js` exports `getDb()` (returns SQLite database instance). `index.js` starts Express server on port 5000.

- [ ] **Step 1: Create `server/package.json`**

```json
{
  "name": "kaarya-server",
  "version": "1.0.0",
  "description": "Kaarya backend API server",
  "main": "src/index.js",
  "scripts": {
    "start": "node src/index.js",
    "dev": "node --watch src/index.js"
  },
  "dependencies": {
    "bcryptjs": "^2.4.3",
    "better-sqlite3": "^11.6.0",
    "cors": "^2.8.5",
    "express": "^4.21.0",
    "jsonwebtoken": "^9.0.2"
  }
}
```

- [ ] **Step 2: Create `server/src/db.js`**

```js
const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'database.sqlite');

let _db = null;

function getDb() {
  if (_db) return _db;
  _db = new Database(DB_PATH);
  _db.pragma('journal_mode = WAL');
  initSchema(_db);
  return _db;
}

function initSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      phone TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      name TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('seeker', 'provider')),
      avatar_url TEXT,
      bio TEXT,
      verification_status TEXT DEFAULT 'unverified' CHECK (verification_status IN ('unverified', 'pending', 'verified', 'rejected')),
      rating REAL DEFAULT 4.5,
      review_count INTEGER DEFAULT 0,
      completion_rate INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      seeker_id INTEGER NOT NULL REFERENCES users(id),
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      category TEXT NOT NULL,
      area TEXT NOT NULL,
      address TEXT,
      budget_min INTEGER,
      budget_max INTEGER,
      negotiation_mode TEXT DEFAULT 'negotiable' CHECK (negotiation_mode IN ('fixed', 'open_offers', 'negotiable')),
      status TEXT DEFAULT 'open' CHECK (status IN ('open', 'assigned', 'in_progress', 'completed', 'cancelled')),
      photo_urls TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS offers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      job_id INTEGER NOT NULL REFERENCES jobs(id),
      provider_id INTEGER NOT NULL REFERENCES users(id),
      price INTEGER NOT NULL,
      message TEXT,
      estimated_arrival TEXT,
      status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected', 'withdrawn', 'countered')),
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS negotiations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      offer_id INTEGER NOT NULL REFERENCES offers(id),
      from_user_id INTEGER NOT NULL REFERENCES users(id),
      price INTEGER NOT NULL,
      message TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS conversations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      job_id INTEGER NOT NULL REFERENCES jobs(id),
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS conversation_participants (
      conversation_id INTEGER NOT NULL REFERENCES conversations(id),
      user_id INTEGER NOT NULL REFERENCES users(id),
      PRIMARY KEY (conversation_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      conversation_id INTEGER NOT NULL REFERENCES conversations(id),
      sender_id INTEGER NOT NULL REFERENCES users(id),
      text TEXT NOT NULL,
      read_at TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id),
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT,
      data TEXT,
      read INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);

  // Seed demo jobs if table is empty
  const count = db.prepare('SELECT COUNT(*) as c FROM jobs').get();
  if (count.c === 0) {
    const insertJob = db.prepare(`
      INSERT INTO jobs (seeker_id, title, description, category, area, budget_min, budget_max, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'open')
    `);
    const seedJobs = [
      [2, 'Fix leaking kitchen tap', 'Kitchen tap has been dripping for 2 days. Need a plumber to fix it ASAP.', 'plumbing', 'Thamel', 800, 1200],
      [2, 'Paint 2 bedroom walls', 'Looking for someone to paint two bedrooms. Approximately 400 sq ft total. White color preferred.', 'painting', 'Lazimpat', 8000, 12000],
      [2, 'AC not cooling properly', 'My split AC is running but not cooling. Needs gas refill or repair.', 'appliance', 'Jhamsikhel', 2000, 3500],
      [2, 'Move 3-seater sofa to 2nd floor', 'Need help moving a heavy 3-seater sofa from ground floor to 2nd floor apartment.', 'moving', 'Kumaripati', 1500, 2000],
      [2, 'Deep clean 2BHK apartment', 'Moving out clean needed. 2 bedrooms, 1 hall, 1 kitchen. Includes bathroom cleaning.', 'cleaning', 'Baneshwor', 3500, 5000],
      [2, 'Fix electrical switchboard', 'Two switches in living room are sparking. Need immediate attention for safety.', 'electrical', 'Putalisadak', 500, 800],
      [2, 'Assemble IKEA wardrobes', 'Bought two IKEA PAX wardrobes. Need someone to assemble and mount on wall.', 'carpentry', 'Samakhushi', 2500, 4000],
      [2, 'Computer virus removal', 'Windows laptop running very slow, suspect virus. Need cleaning and antivirus setup.', 'appliance', 'Maharajgunj', 1000, 1500],
    ];
    const insertMany = db.transaction((jobs) => {
      for (const j of jobs) insertJob.run(...j);
    });
    insertMany(seedJobs);
  }
}

module.exports = { getDb };
```

- [ ] **Step 3: Create `server/src/index.js`**

```js
const express = require('express');
const cors = require('cors');
const { getDb } = require('./db');
const authRoutes = require('./routes/auth');
const jobsRoutes = require('./routes/jobs');
const offersRoutes = require('./routes/offers');
const conversationsRoutes = require('./routes/conversations');

const app = express();
const PORT = 5000;

// Middleware
app.use(cors({ origin: '*' }));
app.use(express.json());

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/jobs', jobsRoutes);
app.use('/api/offers', offersRoutes);
app.use('/api/conversations', conversationsRoutes);

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error' });
});

// Initialize DB and start
getDb();
app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n╔══════════════════════════════════════════════════════════════╗`);
  console.log(`║            🚀 Kaarya Server Running                      ║`);
  console.log(`╠══════════════════════════════════════════════════════════════╣`);
  console.log(`║  Server:    http://localhost:${PORT}                           ║`);
  console.log(`║  API Base:  http://localhost:${PORT}/api                        ║`);
  console.log(`║  Health:    http://localhost:${PORT}/api/health                 ║`);
  console.log(`╚══════════════════════════════════════════════════════════════╝\n`);
});
```

- [ ] **Step 4: Test health endpoint**

Run: `cd server && npm install && node src/index.js`
Expected: Server starts, "Kaarya Server Running" log shown
Open: `http://localhost:5000/api/health`
Expected: `{"status":"ok","timestamp":"..."}`

- [ ] **Step 5: Commit**

```bash
cd "C:\Users\HP\Desktop\Kaarya mobile app\Kaarya"
git add server/package.json server/src/db.js server/src/index.js
git commit -m "feat(server): scaffold Express + SQLite backend, health check endpoint"
```

---

## Task 2: Auth middleware + routes

**Files:**
- Create: `server/src/middleware/auth.js`
- Create: `server/src/routes/auth.js`

**Interfaces:**
- `auth.js` exports `requireAuth(req, res, next)` — sets `req.userId` from JWT Bearer token, returns 401 if invalid
- `auth.js` exports `signToken(userId)` — creates JWT with 7-day expiry
- `auth.js` exports `hashPassword(password)` and `verifyPassword(password, hash)` — bcrypt wrappers
- `auth.js` exports `JWT_SECRET = 'kaarya-jwt-secret-change-in-production'`
- `routes/auth.js` exports the router — consumes the above

- [ ] **Step 1: Create `server/src/middleware/auth.js`**

```js
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const JWT_SECRET = 'kaarya-jwt-secret-change-in-production';
const JWT_EXPIRY = '7d';
const BCRYPT_ROUNDS = 10;

function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized — no token provided' });
  }
  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.userId = payload.userId;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

function signToken(userId) {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: JWT_EXPIRY });
}

async function hashPassword(password) {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

async function verifyPassword(password, hash) {
  return bcrypt.compare(password, hash);
}

module.exports = { requireAuth, signToken, hashPassword, verifyPassword, JWT_SECRET };
```

- [ ] **Step 2: Create `server/src/routes/auth.js`**

```js
const express = require('express');
const { getDb } = require('../db');
const { requireAuth, signToken, hashPassword, verifyPassword } = require('../middleware/auth');

const router = express.Router();

// POST /api/auth/register
router.post('/register', async (req, res, next) => {
  try {
    const { phone, password, name, role } = req.body;
    if (!phone || !password || !name || !role) {
      return res.status(400).json({ error: 'Missing required fields: phone, password, name, role' });
    }
    if (!['seeker', 'provider'].includes(role)) {
      return res.status(400).json({ error: 'Role must be seeker or provider' });
    }
    const db = getDb();
    const existing = db.prepare('SELECT id FROM users WHERE phone = ?').get(phone);
    if (existing) {
      return res.status(409).json({ error: 'Phone number already registered' });
    }
    const passwordHash = await hashPassword(password);
    const result = db.prepare(
      'INSERT INTO users (phone, password_hash, name, role) VALUES (?, ?, ?, ?)'
    ).run(phone, passwordHash, name, role);
    const userId = result.lastInsertRowid;
    const token = signToken(userId);
    const user = db.prepare(
      'SELECT id, phone, name, role, avatar_url, verification_status, rating, review_count, completion_rate, created_at FROM users WHERE id = ?'
    ).get(userId);
    res.status(201).json({
      token,
      user: { id: user.id, phone: user.phone, name: user.name, role: user.role, avatarUrl: user.avatar_url, verificationStatus: user.verification_status, rating: user.rating, reviewCount: user.review_count, completionRate: user.completion_rate, createdAt: user.created_at },
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/login
router.post('/login', async (req, res, next) => {
  try {
    const { phone, password } = req.body;
    if (!phone || !password) {
      return res.status(400).json({ error: 'Phone and password are required' });
    }
    const db = getDb();
    const user = db.prepare('SELECT * FROM users WHERE phone = ?').get(phone);
    if (!user) {
      return res.status(401).json({ error: 'Invalid phone or password' });
    }
    const valid = await verifyPassword(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid phone or password' });
    }
    const token = signToken(user.id);
    res.json({
      token,
      user: { id: user.id, phone: user.phone, name: user.name, role: user.role, avatarUrl: user.avatar_url, verificationStatus: user.verification_status, rating: user.rating, reviewCount: user.review_count, completionRate: user.completion_rate, createdAt: user.created_at },
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/auth/me
router.get('/me', requireAuth, (req, res, next) => {
  try {
    const db = getDb();
    const user = db.prepare(
      'SELECT id, phone, name, role, avatar_url, bio, verification_status, rating, review_count, completion_rate, created_at FROM users WHERE id = ?'
    ).get(req.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json({ id: user.id, phone: user.phone, name: user.name, role: user.role, avatarUrl: user.avatar_url, bio: user.bio, verificationStatus: user.verification_status, rating: user.rating, reviewCount: user.review_count, completionRate: user.completion_rate, createdAt: user.created_at });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/logout
router.post('/logout', requireAuth, (req, res) => {
  // JWT is stateless — client discards token. Server just returns success.
  res.json({ message: 'Logged out successfully' });
});

module.exports = router;
```

- [ ] **Step 3: Test auth endpoints**

Run: `node src/index.js` (already running from Task 1)

Test registration:
```bash
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"phone":"9801111111","password":"test123","name":"Test User","role":"seeker"}'
```
Expected: 201 with `{ token: "...", user: { id, phone, name, role, ... } }`

Test login:
```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"phone":"9801111111","password":"test123"}'
```
Expected: 200 with token + user

Test /me with token:
```bash
curl http://localhost:5000/api/auth/me -H "Authorization: Bearer <token>"
```
Expected: 200 with user object

- [ ] **Step 4: Commit**

```bash
git add server/src/middleware/auth.js server/src/routes/auth.js
git commit -m "feat(server): add JWT auth middleware and auth routes (register/login/logout/me)"
```

---

## Task 3: Jobs routes

**Files:**
- Create: `server/src/routes/jobs.js`

**Interfaces:**
- Produces: `GET /api/jobs` — list jobs with optional `?category=&area=&status=&page=`
- Produces: `POST /api/jobs` — create job (auth required, seeker only)
- Produces: `GET /api/jobs/:id` — get single job with offer count
- Produces: `PUT /api/jobs/:id/status` — update job status (auth required, owner only)

- [ ] **Step 1: Create `server/src/routes/jobs.js`**

```js
const express = require('express');
const { getDb } = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
const PAGE_SIZE = 20;

function userRow(row) {
  return {
    id: row.id, seekerId: row.seeker_id, seekerName: row.seeker_name,
    seekerAvatar: row.seeker_avatar, title: row.title, description: row.description,
    category: row.category, area: row.area, address: row.address,
    budgetMin: row.budget_min, budgetMax: row.budget_max,
    negotiationMode: row.negotiation_mode, status: row.status,
    photoUrls: row.photo_urls ? JSON.parse(row.photo_urls) : [],
    offerCount: row.offer_count || 0, createdAt: row.created_at,
  };
}

// GET /api/jobs
router.get('/', (req, res, next) => {
  try {
    const db = getDb();
    const { category, area, status, page = 1 } = req.query;
    const offset = (parseInt(page) - 1) * PAGE_SIZE;

    let where = [];
    let params = [];
    if (category) { where.push('j.category = ?'); params.push(category); }
    if (area) { where.push('j.area = ?'); params.push(area); }
    if (status) { where.push('j.status = ?'); params.push(status); }
    const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const jobs = db.prepare(`
      SELECT j.*, u.name as seeker_name, u.avatar_url as seeker_avatar,
             (SELECT COUNT(*) FROM offers o WHERE o.job_id = j.id) as offer_count
      FROM jobs j
      JOIN users u ON j.seeker_id = u.id
      ${whereClause}
      ORDER BY j.created_at DESC
      LIMIT ? OFFSET ?
    `).all(...params, PAGE_SIZE, offset);

    const total = db.prepare(`
      SELECT COUNT(*) as c FROM jobs j ${whereClause}
    `).get(...params).c;

    res.json({ jobs: jobs.map(userRow), total, page: parseInt(page), pageSize: PAGE_SIZE });
  } catch (err) { next(err); }
});

// GET /api/jobs/:id
router.get('/:id', (req, res, next) => {
  try {
    const db = getDb();
    const job = db.prepare(`
      SELECT j.*, u.name as seeker_name, u.avatar_url as seeker_avatar,
             (SELECT COUNT(*) FROM offers o WHERE o.job_id = j.id) as offer_count
      FROM jobs j JOIN users u ON j.seeker_id = u.id
      WHERE j.id = ?
    `).get(req.params.id);
    if (!job) return res.status(404).json({ error: 'Job not found' });
    res.json(userRow(job));
  } catch (err) { next(err); }
});

// POST /api/jobs
router.post('/', requireAuth, (req, res, next) => {
  try {
    const db = getDb();
    const user = db.prepare('SELECT role FROM users WHERE id = ?').get(req.userId);
    if (!user || user.role !== 'seeker') {
      return res.status(403).json({ error: 'Only seekers can post jobs' });
    }
    const { title, description, category, area, address, budgetMin, budgetMax, negotiationMode, photoUrls } = req.body;
    if (!title || !description || !category || !area) {
      return res.status(400).json({ error: 'title, description, category, area are required' });
    }
    const result = db.prepare(`
      INSERT INTO jobs (seeker_id, title, description, category, area, address, budget_min, budget_max, negotiation_mode, photo_urls)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(req.userId, title, description, category, area, address || null, budgetMin || null, budgetMax || null, negotiationMode || 'negotiable', photoUrls ? JSON.stringify(photoUrls) : null);
    const job = db.prepare(`
      SELECT j.*, u.name as seeker_name, u.avatar_url as seeker_avatar,
             0 as offer_count
      FROM jobs j JOIN users u ON j.seeker_id = u.id WHERE j.id = ?
    `).get(result.lastInsertRowid);
    res.status(201).json(userRow(job));
  } catch (err) { next(err); }
});

// PUT /api/jobs/:id/status
router.put('/:id/status', requireAuth, (req, res, next) => {
  try {
    const db = getDb();
    const job = db.prepare('SELECT * FROM jobs WHERE id = ?').get(req.params.id);
    if (!job) return res.status(404).json({ error: 'Job not found' });
    if (job.seeker_id !== req.userId) return res.status(403).json({ error: 'Not authorized' });
    const { status } = req.body;
    if (!['open', 'assigned', 'in_progress', 'completed', 'cancelled'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }
    db.prepare('UPDATE jobs SET status = ? WHERE id = ?').run(status, req.params.id);
    res.json({ message: 'Status updated', status });
  } catch (err) { next(err); }
});

module.exports = router;
```

- [ ] **Step 2: Test jobs endpoints**

Test list:
```bash
curl http://localhost:5000/api/jobs
```
Expected: 200 with `{ jobs: [...8 jobs], total: 8, page: 1, pageSize: 20 }`

Test filter:
```bash
curl "http://localhost:5000/api/jobs?category=plumbing"
```
Expected: 1 job (Fix leaking kitchen tap)

Test create job (use token from Task 2):
```bash
curl -X POST http://localhost:5000/api/jobs \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{"title":"Test Job","description":"Test description","category":"cleaning","area":"Thamel"}'
```
Expected: 201 with job object

- [ ] **Step 3: Commit**

```bash
git add server/src/routes/jobs.js
git commit -m "feat(server): add jobs CRUD routes with filtering and pagination"
```

---

## Task 4: Offers + Negotiations routes

**Files:**
- Create: `server/src/routes/offers.js`

**Interfaces:**
- Produces: `POST /api/offers` — submit offer (auth required, provider only)
- Produces: `GET /api/offers/:id` — get offer with negotiation history
- Produces: `POST /api/offers/:id/accept` — accept offer (seeker only)
- Produces: `POST /api/offers/:id/reject` — reject offer
- Produces: `POST /api/offers/:id/withdraw` — withdraw offer (provider only)
- Produces: `POST /api/offers/:id/counter` — counter-offer (seeker only)

- [ ] **Step 1: Create `server/src/routes/offers.js`**

```js
const express = require('express');
const { getDb } = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

function offerRow(row) {
  return {
    id: row.id, jobId: row.job_id, providerId: row.provider_id,
    providerName: row.provider_name, providerAvatar: row.provider_avatar,
    providerRating: row.provider_rating, providerCompletionRate: row.provider_completion_rate,
    price: row.price, message: row.message, estimatedArrival: row.estimated_arrival,
    status: row.status, negotiations: row.negotiations || [], createdAt: row.created_at,
  };
}

// POST /api/offers
router.post('/', requireAuth, (req, res, next) => {
  try {
    const db = getDb();
    const user = db.prepare('SELECT role FROM users WHERE id = ?').get(req.userId);
    if (!user || user.role !== 'provider') {
      return res.status(403).json({ error: 'Only providers can submit offers' });
    }
    const { jobId, price, message, estimatedArrival } = req.body;
    if (!jobId || !price) {
      return res.status(400).json({ error: 'jobId and price are required' });
    }
    const job = db.prepare('SELECT * FROM jobs WHERE id = ?').get(jobId);
    if (!job) return res.status(404).json({ error: 'Job not found' });
    if (job.status !== 'open') return res.status(400).json({ error: 'Job is not open for offers' });

    const result = db.prepare(
      'INSERT INTO offers (job_id, provider_id, price, message, estimated_arrival) VALUES (?, ?, ?, ?, ?)'
    ).run(jobId, req.userId, price, message || null, estimatedArrival || null);

    const offer = db.prepare(`
      SELECT o.*, u.name as provider_name, u.avatar_url as provider_avatar,
             u.rating as provider_rating, u.completion_rate as provider_completion_rate
      FROM offers o JOIN users u ON o.provider_id = u.id WHERE o.id = ?
    `).get(result.lastInsertRowid);

    res.status(201).json(offerRow(offer));
  } catch (err) { next(err); }
});

// GET /api/offers/:id
router.get('/:id', requireAuth, (req, res, next) => {
  try {
    const db = getDb();
    const offer = db.prepare(`
      SELECT o.*, u.name as provider_name, u.avatar_url as provider_avatar,
             u.rating as provider_rating, u.completion_rate as provider_completion_rate
      FROM offers o JOIN users u ON o.provider_id = u.id WHERE o.id = ?
    `).get(req.params.id);
    if (!offer) return res.status(404).json({ error: 'Offer not found' });
    const negotiations = db.prepare(
      'SELECT n.*, u.name as from_user_name FROM negotiations n JOIN users u ON n.from_user_id = u.id WHERE n.offer_id = ? ORDER BY n.created_at ASC'
    ).all(req.params.id);
    offer.negotiations = negotiations.map(n => ({
      id: n.id, offerId: n.offer_id, fromUserId: n.from_user_id, fromUserName: n.from_user_name,
      price: n.price, message: n.message, createdAt: n.created_at,
    }));
    res.json(offerRow(offer));
  } catch (err) { next(err); }
});

// POST /api/offers/:id/accept
router.post('/:id/accept', requireAuth, (req, res, next) => {
  try {
    const db = getDb();
    const offer = db.prepare('SELECT * FROM offers WHERE id = ?').get(req.params.id);
    if (!offer) return res.status(404).json({ error: 'Offer not found' });
    const job = db.prepare('SELECT * FROM jobs WHERE id = ?').get(offer.job_id);
    if (job.seeker_id !== req.userId) return res.status(403).json({ error: 'Only the job seeker can accept offers' });
    if (offer.status !== 'pending') return res.status(400).json({ error: 'Offer is no longer pending' });

    db.prepare("UPDATE offers SET status = 'accepted' WHERE id = ?").run(req.params.id);
    db.prepare("UPDATE jobs SET status = 'assigned' WHERE id = ?").run(offer.job_id);
    // Reject other pending offers on this job
    db.prepare("UPDATE offers SET status = 'rejected' WHERE job_id = ? AND id != ? AND status = 'pending'").run(offer.job_id, req.params.id);

    res.json({ message: 'Offer accepted', status: 'accepted' });
  } catch (err) { next(err); }
});

// POST /api/offers/:id/reject
router.post('/:id/reject', requireAuth, (req, res, next) => {
  try {
    const db = getDb();
    const offer = db.prepare('SELECT * FROM offers WHERE id = ?').get(req.params.id);
    if (!offer) return res.status(404).json({ error: 'Offer not found' });
    const job = db.prepare('SELECT * FROM jobs WHERE id = ?').get(offer.job_id);
    if (job.seeker_id !== req.userId) return res.status(403).json({ error: 'Not authorized' });
    db.prepare("UPDATE offers SET status = 'rejected' WHERE id = ?").run(req.params.id);
    res.json({ message: 'Offer rejected', status: 'rejected' });
  } catch (err) { next(err); }
});

// POST /api/offers/:id/withdraw
router.post('/:id/withdraw', requireAuth, (req, res, next) => {
  try {
    const db = getDb();
    const offer = db.prepare('SELECT * FROM offers WHERE id = ?').get(req.params.id);
    if (!offer) return res.status(404).json({ error: 'Offer not found' });
    if (offer.provider_id !== req.userId) return res.status(403).json({ error: 'Only the provider can withdraw their offer' });
    db.prepare("UPDATE offers SET status = 'withdrawn' WHERE id = ?").run(req.params.id);
    res.json({ message: 'Offer withdrawn', status: 'withdrawn' });
  } catch (err) { next(err); }
});

// POST /api/offers/:id/counter
router.post('/:id/counter', requireAuth, (req, res, next) => {
  try {
    const db = getDb();
    const { price, message } = req.body;
    if (!price) return res.status(400).json({ error: 'price is required' });
    const offer = db.prepare('SELECT * FROM offers WHERE id = ?').get(req.params.id);
    if (!offer) return res.status(404).json({ error: 'Offer not found' });
    const job = db.prepare('SELECT * FROM jobs WHERE id = ?').get(offer.job_id);
    if (job.seeker_id !== req.userId) return res.status(403).json({ error: 'Only the job seeker can counter-offer' });

    db.prepare("UPDATE offers SET status = 'countered' WHERE id = ?").run(req.params.id);
    db.prepare(
      'INSERT INTO negotiations (offer_id, from_user_id, price, message) VALUES (?, ?, ?, ?)'
    ).run(req.params.id, req.userId, price, message || null);

    // Create a new offer as counter — provider can accept or reject
    const newOffer = db.prepare(
      'INSERT INTO offers (job_id, provider_id, price, message, estimated_arrival) VALUES (?, ?, ?, ?, ?)'
    ).run(offer.job_id, offer.provider_id, price, `Counter offer: ${message || ''}`, offer.estimated_arrival);

    const fullOffer = db.prepare(`
      SELECT o.*, u.name as provider_name, u.avatar_url as provider_avatar,
             u.rating as provider_rating, u.completion_rate as provider_completion_rate
      FROM offers o JOIN users u ON o.provider_id = u.id WHERE o.id = ?
    `).get(newOffer.lastInsertRowid);

    res.json(offerRow(fullOffer));
  } catch (err) { next(err); }
});

// GET /api/jobs/:jobId/offers — list offers for a job
router.get('/job/:jobId', (req, res, next) => {
  try {
    const db = getDb();
    const offers = db.prepare(`
      SELECT o.*, u.name as provider_name, u.avatar_url as provider_avatar,
             u.rating as provider_rating, u.completion_rate as provider_completion_rate
      FROM offers o JOIN users u ON o.provider_id = u.id WHERE o.job_id = ?
      ORDER BY o.created_at DESC
    `).all(req.params.jobId);
    res.json(offers.map(offerRow));
  } catch (err) { next(err); }
});

module.exports = router;
```

- [ ] **Step 2: Test offer flow**

Submit offer:
```bash
curl -X POST http://localhost:5000/api/offers \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <provider-token>" \
  -d '{"jobId":1,"price":1000,"message":"I can fix this today"}'
```
Expected: 201 with offer object

Accept offer (use seeker token):
```bash
curl -X POST http://localhost:5000/api/offers/<offerId>/accept \
  -H "Authorization: Bearer <seeker-token>"
```
Expected: 200

- [ ] **Step 3: Commit**

```bash
git add server/src/routes/offers.js
git commit -m "feat(server): add offers and negotiation routes"
```

---

## Task 5: Conversations + Messages routes

**Files:**
- Create: `server/src/routes/conversations.js`

**Interfaces:**
- Produces: `GET /api/conversations` — list user's conversations
- Produces: `GET /api/conversations/:id` — get conversation details
- Produces: `GET /api/conversations/:id/messages` — get messages in conversation
- Produces: `POST /api/conversations/:id/messages` — send message (creates conversation if needed)

- [ ] **Step 1: Create `server/src/routes/conversations.js`**

```js
const express = require('express');
const { getDb } = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

function messageRow(row) {
  return { id: row.id, conversationId: row.conversation_id, senderId: row.sender_id, text: row.text, createdAt: row.created_at, readAt: row.read_at };
}

function conversationRow(row) {
  return { id: row.id, jobId: row.job_id, jobTitle: row.job_title, participants: row.participants, lastMessage: row.last_message, unreadCount: row.unread_count };
}

// GET /api/conversations
router.get('/', requireAuth, (req, res, next) => {
  try {
    const db = getDb();
    const conversations = db.prepare(`
      SELECT c.*, j.title as job_title,
             (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id AND m.sender_id != ? AND m.read_at IS NULL) as unread_count,
             (SELECT json_group_array(json_object('id', u.id, 'phone', u.phone, 'name', u.name, 'role', u.role, 'avatarUrl', u.avatar_url))
              FROM conversation_participants cp JOIN users u ON cp.user_id = u.id WHERE cp.conversation_id = c.id) as participants_json,
             (SELECT json_object('id', lm.id, 'text', lm.text, 'createdAt', lm.created_at, 'senderId', lm.sender_id)
              FROM messages lm WHERE lm.conversation_id = c.id ORDER BY lm.created_at DESC LIMIT 1) as last_message_json
      FROM conversations c
      JOIN jobs j ON c.job_id = j.id
      JOIN conversation_participants cp2 ON cp2.conversation_id = c.id AND cp2.user_id = ?
      ORDER BY c.created_at DESC
    `).all(req.userId, req.userId);

    const result = conversations.map(c => ({
      id: c.id, jobId: c.job_id, jobTitle: c.job_title,
      participants: JSON.parse(c.participants_json || '[]'),
      lastMessage: c.last_message_json ? JSON.parse(c.last_message_json) : null,
      unreadCount: c.unread_count,
    }));
    res.json(result);
  } catch (err) { next(err); }
});

// GET /api/conversations/:id
router.get('/:id', requireAuth, (req, res, next) => {
  try {
    const db = getDb();
    const conv = db.prepare('SELECT * FROM conversations WHERE id = ?').get(req.params.id);
    if (!conv) return res.status(404).json({ error: 'Conversation not found' });
    const isParticipant = db.prepare(
      'SELECT 1 FROM conversation_participants WHERE conversation_id = ? AND user_id = ?'
    ).get(req.params.id, req.userId);
    if (!isParticipant) return res.status(403).json({ error: 'Not a participant' });
    const job = db.prepare('SELECT id, title FROM jobs WHERE id = ?').get(conv.job_id);
    const participants = db.prepare(
      'SELECT u.id, u.phone, u.name, u.role, u.avatar_url FROM conversation_participants cp JOIN users u ON cp.user_id = u.id WHERE cp.conversation_id = ?'
    ).all(req.params.id);
    res.json({ id: conv.id, jobId: conv.job_id, jobTitle: job.title, participants: participants.map(p => ({ id: p.id, phone: p.phone, name: p.name, role: p.role, avatarUrl: p.avatar_url })), createdAt: conv.created_at });
  } catch (err) { next(err); }
});

// GET /api/conversations/:id/messages
router.get('/:id/messages', requireAuth, (req, res, next) => {
  try {
    const db = getDb();
    const isParticipant = db.prepare(
      'SELECT 1 FROM conversation_participants WHERE conversation_id = ? AND user_id = ?'
    ).get(req.params.id, req.userId);
    if (!isParticipant) return res.status(403).json({ error: 'Not a participant' });
    const messages = db.prepare(
      'SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC'
    ).all(req.params.id);
    // Mark as read
    db.prepare("UPDATE messages SET read_at = datetime('now') WHERE conversation_id = ? AND sender_id != ? AND read_at IS NULL")
      .run(req.params.id, req.userId);
    res.json(messages.map(messageRow));
  } catch (err) { next(err); }
});

// POST /api/conversations/:id/messages — send message (also auto-creates conversation if needed)
router.post('/:id/messages', requireAuth, (req, res, next) => {
  try {
    const db = getDb();
    const { text } = req.body;
    if (!text) return res.status(400).json({ error: 'text is required' });

    // Ensure conversation exists and user is a participant
    let conv = db.prepare('SELECT * FROM conversations WHERE id = ?').get(req.params.id);
    if (!conv) {
      // Auto-create conversation with this job
      const job = db.prepare('SELECT * FROM jobs WHERE id = ?').get(req.params.id);
      if (!job) return res.status(404).json({ error: 'Job not found' });
      const result = db.prepare('INSERT INTO conversations (job_id) VALUES (?)').run(req.params.id);
      conv = { id: result.lastInsertRowid, job_id: req.params.id };
      db.prepare('INSERT INTO conversation_participants (conversation_id, user_id) VALUES (?, ?)').run(conv.id, req.userId);
      // Add the other party too
      const otherId = job.seeker_id !== req.userId ? job.seeker_id : null;
      if (otherId) db.prepare('INSERT INTO conversation_participants (conversation_id, user_id) VALUES (?, ?)').run(conv.id, otherId);
    } else {
      const isParticipant = db.prepare(
        'SELECT 1 FROM conversation_participants WHERE conversation_id = ? AND user_id = ?'
      ).get(conv.id, req.userId);
      if (!isParticipant) return res.status(403).json({ error: 'Not a participant' });
    }

    const result = db.prepare(
      'INSERT INTO messages (conversation_id, sender_id, text) VALUES (?, ?, ?)'
    ).run(conv.id, req.userId, text);
    const msg = db.prepare('SELECT * FROM messages WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(messageRow(msg));
  } catch (err) { next(err); }
});

module.exports = router;
```

- [ ] **Step 2: Test conversation flow**

Test list (empty initially):
```bash
curl http://localhost:5000/api/conversations -H "Authorization: Bearer <token>"
```
Expected: 200 with `[]`

Send a message (creates conversation auto):
```bash
curl -X POST http://localhost:5000/api/conversations/1/messages \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{"text":"Hello, is the job still available?"}'
```
Expected: 201 with message object

List conversations:
```bash
curl http://localhost:5000/api/conversations -H "Authorization: Bearer <token>"
```
Expected: 200 with conversation containing the message

- [ ] **Step 3: Commit**

```bash
git add server/src/routes/conversations.js
git commit -m "feat(server): add conversations and messaging routes"
```

---

## Task 6: Wire mobile app to server + final testing

**Files:**
- Modify: `server/src/index.js` (add conversations routes import — already done in Task 1)
- Modify: `server/package.json` (no changes — routes wired in index.js)
- Modify: `src/lib/api.ts` (BASE_URL — change from localhost to network IP)

**Interfaces:**
- Produces: Mobile app connects to real backend at `http://192.168.1.79:5000/api`

- [ ] **Step 1: Update `src/lib/api.ts` BASE_URL**

The current `BASE_URL` is already `http://192.168.1.79:5000/api` — verify it matches:

```js
const BASE_URL = 'http://192.168.1.79:5000/api';
```

If it differs, update it. The mobile app and server must be on the same network for this to work.

- [ ] **Step 2: Full flow test — register, login, browse jobs, submit offer**

```bash
# 1. Register as seeker
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"phone":"9802222222","password":"test123","name":"Test Seeker","role":"seeker"}'

# 2. Register as provider
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"phone":"9803333333","password":"test123","name":"Test Provider","role":"provider"}'

# 3. Login as provider, get token
TOKEN_P=$(curl -s -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"phone":"9803333333","password":"test123"}' | grep -o '"token":"[^"]*"' | cut -d'"' -f4)

# 4. Submit offer on job #1
curl -X POST http://localhost:5000/api/offers \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN_P" \
  -d '{"jobId":1,"price":1000,"message":"I can fix it today"}'

# 5. Browse jobs
curl http://localhost:5000/api/jobs | jq '.jobs | length'
# Expected: 8

# 6. Filter by category
curl "http://localhost:5000/api/jobs?category=cleaning" | jq '.jobs | length'
# Expected: 1
```

All responses should be valid JSON with correct status codes.

- [ ] **Step 3: Commit mobile changes (if any)**

```bash
git add src/lib/api.ts
git commit -m "chore(mobile): ensure api.ts BASE_URL matches server"
```

- [ ] **Step 4: Push to GitHub**

```bash
git add server/
git commit -m "feat: add full Express+SQLite backend (Stage 2)"
git push origin master
```

---

## Task 7: Update project memory

- [ ] **Step 1: Update memory file**

Modify `C:\Users\HP\.claude\projects\C--Users-HP-Desktop-Claude\memory\kaarya-project-overview.md`:
- Mark Stage 2 as done
- Note: server running at localhost:5000, API at /api

- [ ] **Step 2: Verify Stage 2 is complete**

Mark Stage 2 complete in memory, Stage 3 (Real-time notifications) as next priority.
