const initSqlJs = require('sql.js');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');

// Load .env so DEMO_PASSWORD is available (no-op if vars are already set)
try { require('dotenv').config(); } catch (_) {}

const DB_PATH = path.join(__dirname, 'database.sqlite');

let db;

/**
 * Initialise (or return) the singleton sql.js database instance.
 * sql.js is async because it loads a WASM binary.
 */
async function getDb() {
  if (db) return db;

  const SQL = await initSqlJs();

  let data = null;
  if (fs.existsSync(DB_PATH)) {
    data = fs.readFileSync(DB_PATH);
  }

  db = new SQL.Database(data);
  db.run('PRAGMA journal_mode = WAL');
  db.run('PRAGMA foreign_keys = ON');

  initSchema();
  seedDemoAccounts();
  seedJobs();
  seedConversations();
  save();

  return db;
}

/** Persist the in-memory database to disk. */
function save() {
  if (!db) return;
  const buf = db.export();
  const arr = new Uint8Array(buf);
  fs.writeFileSync(DB_PATH, arr);
}

function initSchema() {
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      phone TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'seeker',
      avatar_url TEXT,
      bio TEXT,
      rating REAL DEFAULT 0,
      review_count INTEGER DEFAULT 0,
      is_verified INTEGER DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      fcm_token TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // Migration: Add missing columns if they don't exist
  try {
    db.run('ALTER TABLE users ADD COLUMN bio TEXT');
  } catch (e) {
    // Column already exists, ignore
  }
  try {
    db.run('ALTER TABLE users ADD COLUMN fcm_token TEXT');
  } catch (e) {
    // Column already exists, ignore
  }
  try {
    db.run('ALTER TABLE users ADD COLUMN is_admin INTEGER DEFAULT 0');
  } catch (e) {
    // Column already exists, ignore
  }

  // OTP codes for registration and password reset
  db.run(`
    CREATE TABLE IF NOT EXISTS otp_codes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      phone TEXT NOT NULL,
      code TEXT NOT NULL,
      type TEXT NOT NULL,
      attempts INTEGER DEFAULT 0,
      expires_at TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      data TEXT
    )
  `);

  // Migration: add `data` column to existing otp_codes table (if missing from older DB)
  try {
    db.run('ALTER TABLE otp_codes ADD COLUMN data TEXT');
  } catch (e) {
    // Column may already exist — ignore error
  }

  // Migration: add precise location columns to jobs
  try {
    db.run('ALTER TABLE jobs ADD COLUMN seeker_lat REAL');
  } catch (e) {
    // Column may already exist — ignore error
  }
  try {
    db.run('ALTER TABLE jobs ADD COLUMN seeker_lng REAL');
  } catch (e) {
    // Column may already exist — ignore error
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS verification_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id),
      level INTEGER NOT NULL DEFAULT 3,
      document_type TEXT NOT NULL,
      documents TEXT NOT NULL,
      notes TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      admin_notes TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      seeker_id INTEGER NOT NULL REFERENCES users(id),
      title TEXT NOT NULL,
      description TEXT,
      category TEXT NOT NULL,
      location TEXT NOT NULL,
      budget_min REAL,
      budget_max REAL,
      status TEXT NOT NULL DEFAULT 'open',
      urgency TEXT DEFAULT 'normal',
      scheduled_date TEXT,
      photo_urls TEXT DEFAULT '[]',
      conversation_id INTEGER REFERENCES conversations(id),
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS offers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      job_id INTEGER NOT NULL REFERENCES jobs(id),
      provider_id INTEGER NOT NULL REFERENCES users(id),
      amount REAL NOT NULL,
      message TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS reviews (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      job_id INTEGER NOT NULL REFERENCES jobs(id),
      reviewer_id INTEGER NOT NULL REFERENCES users(id),
      reviewee_id INTEGER NOT NULL REFERENCES users(id),
      rating INTEGER NOT NULL,
      comment TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(job_id, reviewer_id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS negotiations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      job_id INTEGER NOT NULL REFERENCES jobs(id),
      provider_id INTEGER NOT NULL REFERENCES users(id),
      seeker_id INTEGER NOT NULL REFERENCES users(id),
      proposed_amount REAL NOT NULL,
      status TEXT NOT NULL DEFAULT 'open',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS conversations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      job_id INTEGER REFERENCES jobs(id),
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS conversation_participants (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      conversation_id INTEGER NOT NULL REFERENCES conversations(id),
      user_id INTEGER NOT NULL REFERENCES users(id),
      UNIQUE(conversation_id, user_id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      conversation_id INTEGER NOT NULL REFERENCES conversations(id),
      sender_id INTEGER NOT NULL REFERENCES users(id),
      content TEXT NOT NULL,
      is_read INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id),
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT,
      data TEXT,
      is_read INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS fcm_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id),
      token TEXT NOT NULL UNIQUE,
      created_at TEXT DEFAULT (datetime('now')),
      expires_at TEXT NOT NULL
    )
  `);

  // Index for fast token lookups by user
  db.run('CREATE INDEX IF NOT EXISTS idx_fcm_tokens_user ON fcm_tokens(user_id)');

  // Saved jobs — providers can bookmark jobs to review later
  db.run(`
    CREATE TABLE IF NOT EXISTS saved_jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id),
      job_id INTEGER NOT NULL REFERENCES jobs(id),
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(user_id, job_id)
    )
  `);
  db.run('CREATE INDEX IF NOT EXISTS idx_saved_jobs_user ON saved_jobs(user_id)');

  // JWT blocklist — tokens added here on logout, checked on every requireAuth
  db.run(`
    CREATE TABLE IF NOT EXISTS jwt_blocklist (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      jti TEXT UNIQUE NOT NULL,
      expires_at TEXT NOT NULL,
      revoked_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // Index for fast blocklist lookups
  db.run('CREATE INDEX IF NOT EXISTS idx_jwt_blocklist_jti ON jwt_blocklist(jti)');
}

/**
 * Insert the 4 permanent demo accounts.
 * Uses INSERT OR IGNORE with fixed IDs so it is idempotent — calling it
 * repeatedly never creates duplicates. Accounts are skipped if they already exist.
 */
function seedDemoAccounts() {
  const demoPassword = process.env.DEMO_PASSWORD;
  if (!demoPassword) {
    console.warn('[db] WARNING: DEMO_PASSWORD is not set — demo accounts will not be seeded.');
    return;
  }
  const pwHash = bcrypt.hashSync(demoPassword, 10);

  const demoUsers = [
    // Super Admin (verified)
    [1,    'Super Admin',     'admin@kaarya.demo',  '9800000001', 'admin',   1, 1],
    // Service Providers (verified)
    [100,  'Ganesh Pandey',   'ganesh@kaarya.demo', '9801000001', 'provider', 1, 0],
    [101,  'Abhinav Kaphle',  'abhinav@kaarya.demo','9801000002', 'provider', 1, 0],
    // Task Posters (verified so they can log in without OTP)
    [102,  'Dinesh Aryal',    'dinesh@kaarya.demo', '9801000003', 'seeker',  1, 0],
    [103,  'Suman Adhikari',  'suman@kaarya.demo', '9801000004', 'seeker',  1, 0],
  ];

  for (const [id, name, email, phone, role, isVerified, isAdmin] of demoUsers) {
    db.run(
      `INSERT OR IGNORE INTO users (id, name, email, phone, password_hash, role, is_verified, is_admin, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      [id, name, email, phone, pwHash, role, isVerified, isAdmin]
    );
  }
}

function seedJobs() {
  const result = db.exec('SELECT COUNT(*) as cnt FROM jobs');
  const count = result.length > 0 ? result[0].values[0][0] : 0;
  if (count > 0) return;

  // Assign 8 demo jobs across Dinesh (id=102) and Suman (id=103)
  // Dinesh: 4 jobs (plumbing, painting, appliance, moving)
  // Suman: 4 jobs (cleaning, electrical, carpentry, appliance)
  const jobs = [
    // Dinesh Aryal (id=102) — 4 jobs
    [102, 'Fix leaking kitchen tap', 'Kitchen tap has been dripping for days. Need a plumber ASAP.', 'plumbing', 'Thamel', 800, 1200],
    [102, 'Paint 2 bedroom walls', 'Two bedrooms need fresh paint. White color preferred.', 'painting', 'Lazimpat', 8000, 12000],
    [102, 'AC not cooling properly', 'Split AC unit is not cooling the room efficiently.', 'appliance', 'Jhamsikhel', 2000, 3500],
    [102, 'Move 3-seater sofa to 2nd floor', 'Need help moving a heavy 3-seater sofa from ground to 2nd floor.', 'moving', 'Kumaripati', 1500, 2000],
    // Suman Adhikari (id=103) — 4 jobs
    [103, 'Deep clean 2BHK apartment', 'Full deep cleaning of a 2-bedroom apartment including kitchen and bathrooms.', 'cleaning', 'Baneshwor', 3500, 5000],
    [103, 'Fix electrical switchboard', 'One switchboard has a loose connection causing flickering lights.', 'electrical', 'Putalisadak', 500, 800],
    [103, 'Assemble IKEA wardrobes', 'Two IKEA KALLAX wardrobes need assembly. All parts and tools provided.', 'carpentry', 'Samakhushi', 2500, 4000],
    [103, 'Computer virus removal', 'Laptop infected with malware, running very slow. Need full cleanup.', 'appliance', 'Maharajgunj', 1000, 1500],
  ];

  const insert = db.prepare(
    `INSERT INTO jobs (seeker_id, title, description, category, location, budget_min, budget_max, status, urgency)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'open', 'normal')`
  );

  for (const job of jobs) {
    insert.bind(job);
    insert.step();
    insert.reset();
  }
  insert.free();

  console.log(`[db] Seeded ${jobs.length} demo jobs`);
}

function seedConversations() {
  const result = db.exec('SELECT COUNT(*) as cnt FROM conversations');
  const count = result.length > 0 ? result[0].values[0][0] : 0;
  if (count > 0) return;

  // Demo conversation: Ganesh Pandey (id=100, provider) ↔ Dinesh Aryal (id=102, seeker)
  // on job 1 ("Fix leaking kitchen tap", posted by Dinesh).
  // This lets you immediately test the messaging UI after logging in as either user.
  db.run('INSERT OR IGNORE INTO conversations (id, job_id) VALUES (1, 1)');
  db.run('INSERT OR IGNORE INTO conversation_participants (conversation_id, user_id) VALUES (1, 100)');
  db.run('INSERT OR IGNORE INTO conversation_participants (conversation_id, user_id) VALUES (1, 102)');
  // Message 1: Dinesh (seeker) initiates
  db.run("INSERT OR IGNORE INTO messages (id, conversation_id, sender_id, content, is_read) VALUES (1, 1, 102, 'Hi, is this job still available?', 1)");
  // Message 2: Ganesh (provider) replies
  db.run("INSERT OR IGNORE INTO messages (id, conversation_id, sender_id, content, is_read) VALUES (2, 1, 100, 'Yes it is! I can come by this afternoon. Are you available around 3 PM?', 0)");
  // Message 3: Dinesh responds
  db.run("INSERT OR IGNORE INTO messages (id, conversation_id, sender_id, content, is_read) VALUES (3, 1, 102, 'Perfect, 3 PM works for me. The address is in Thamel. I will share the exact location.', 0)");

  console.log('[db] Demo conversations seeded (Ganesh ↔ Dinesh on job 1)');
}

module.exports = { getDb, save };
