const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

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
}

function seedJobs() {
  const result = db.exec('SELECT COUNT(*) as cnt FROM jobs');
  const count = result.length > 0 ? result[0].values[0][0] : 0;
  if (count > 0) return;

  // Insert a demo seeker so FK constraint is satisfied for seeded jobs
  // Password: password123
  db.run(`
    INSERT OR IGNORE INTO users (id, name, email, phone, password_hash, role)
    VALUES (2, 'Demo Seeker', 'demo@kaarya.com', '9800000001', '$2a$10$aKK1lJ1zcrgGz0aZoEMhxuHUDaULmHfh2Vs3qfOA1wgnSImZ41PNC', 'seeker')
  `);

  const jobs = [
    ['Fix leaking kitchen tap', 'Kitchen tap has been dripping for days. Need a plumber ASAP.', 'plumbing', 'Thamel', 800, 1200],
    ['Paint 2 bedroom walls', 'Two bedrooms need fresh paint. White color preferred.', 'painting', 'Lazimpat', 8000, 12000],
    ['AC not cooling properly', 'Split AC unit is not cooling the room efficiently.', 'appliance', 'Jhamsikhel', 2000, 3500],
    ['Move 3-seater sofa to 2nd floor', 'Need help moving a heavy 3-seater sofa from ground to 2nd floor.', 'moving', 'Kumaripati', 1500, 2000],
    ['Deep clean 2BHK apartment', 'Full deep cleaning of a 2-bedroom apartment including kitchen and bathrooms.', 'cleaning', 'Baneshwor', 3500, 5000],
    ['Fix electrical switchboard', 'One switchboard has a loose connection causing flickering lights.', 'electrical', 'Putalisadak', 500, 800],
    ['Assemble IKEA wardrobes', 'Two IKEA KALLAX wardrobes need assembly. All parts and tools provided.', 'carpentry', 'Samakhushi', 2500, 4000],
    ['Computer virus removal', 'Laptop infected with malware, running very slow. Need full cleanup.', 'appliance', 'Maharajgunj', 1000, 1500],
  ];

  const insert = db.prepare(
    `INSERT INTO jobs (seeker_id, title, description, category, location, budget_min, budget_max, status, urgency)
     VALUES (2, ?, ?, ?, ?, ?, ?, 'open', 'normal')`
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

  // Insert a demo provider so FK constraint is satisfied
  // Password: password123
  db.run(`
    INSERT OR IGNORE INTO users (id, name, email, phone, password_hash, role)
    VALUES (3, 'Demo Provider', 'demo.provider@kaarya.com', '9800000003', '$2a$10$aKK1lJ1zcrgGz0aZoEMhxuHUDaULmHfh2Vs3qfOA1wgnSImZ41PNC', 'provider')
  `);

  // Also insert the test users (ids 10 and 11 for integration testing)
  // Password: password123
  db.run(`
    INSERT OR IGNORE INTO users (id, name, email, phone, password_hash, role)
    VALUES (10, 'Seeker One', '9900000001@kaarya.local', '9900000001', '$2a$10$aKK1lJ1zcrgGz0aZoEMhxuHUDaULmHfh2Vs3qfOA1wgnSImZ41PNC', 'seeker')
  `);
  db.run(`
    INSERT OR IGNORE INTO users (id, name, email, phone, password_hash, role)
    VALUES (11, 'Provider One', '9900000002@kaarya.local', '9900000002', '$2a$10$aKK1lJ1zcrgGz0aZoEMhxuHUDaULmHfh2Vs3qfOA1wgnSImZ41PNC', 'provider')
  `);

  // Conversation 1: seeker (id=10) and provider (id=11) on job 1
  db.run('INSERT OR IGNORE INTO conversations (id, job_id) VALUES (1, 1)');
  db.run('INSERT OR IGNORE INTO conversation_participants (conversation_id, user_id) VALUES (1, 10)');
  db.run('INSERT OR IGNORE INTO conversation_participants (conversation_id, user_id) VALUES (1, 11)');
  db.run('INSERT INTO messages (conversation_id, sender_id, content, is_read) VALUES (1, 10, \'Hi, is this job still available?\', 1)');
  db.run('INSERT INTO messages (conversation_id, sender_id, content, is_read) VALUES (1, 11, \'Yes it is! When do you need it done?\', 0)');

  console.log('[db] Seeded demo conversations');
}

module.exports = { getDb, save };
