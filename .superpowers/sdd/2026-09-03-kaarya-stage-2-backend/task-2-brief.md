# Task 2 Brief: Auth middleware + routes

## Plan Context
- Project: Kaarya mobile app (Expo/React Native)
- Root: `C:\Users\HP\Desktop\Kaarya mobile app\Kaarya`
- Server root: `C:\Users\HP\Desktop\Kaarya mobile app\Kaarya\server`
- Branch: master
- Task 1 BASE commit: f39356cc76e20a34abc36c60eb9057775b887de5

## Global Constraints (binding on this task)
- Node.js 18+
- Server port: 5000
- JWT expiry: 7 days
- bcrypt 10 rounds
- JWT_SECRET = 'kaarya-jwt-secret-change-in-production'
- All API responses: `{ data: ... }` wrapper or `{ error: string }` on failure

## What to build
Two files:
1. `server/src/middleware/auth.js` — JWT + bcrypt middleware
2. `server/src/routes/auth.js` — register/login/logout/me routes

## Task 1 context (consumed by this task)
- Database uses `sql.js` (async `getDb()`) — await before queries
- Users table: `id, name, email, phone, password_hash, role, avatar_url, rating, review_count, is_verified, fcm_token, created_at, updated_at`
- NOTE: No `verification_status` or `completion_rate` columns — return `null` or defaults for those fields
- Seed demo user exists with id=2 (phone='9800000001', role='seeker')

## Step-by-step

### Step 1: Create `server/src/middleware/auth.js`

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

### Step 2: Create `server/src/routes/auth.js`

The routes must match what `src/lib/api.ts` expects. Read the API shapes from `C:\Users\HP\Desktop\Kaarya mobile app\Kaarya\src\lib\api.ts` for exact field names. Key shapes:

**POST /api/auth/register** → `{ token: string, user: User }`
- Body: `{ phone, password, name, role: 'seeker' | 'provider' }`
- Returns: `{ token: "...", user: { id, phone, name, role, avatarUrl, verificationStatus, rating, reviewCount, completionRate, createdAt } }`
- 409 if phone already registered
- 400 if missing fields or invalid role

**POST /api/auth/login** → `{ token: string, user: User }`
- Body: `{ phone, password }`
- Returns same shape as register
- 401 if invalid credentials

**GET /api/auth/me** (auth required) → `{ id, phone, name, role, avatarUrl, bio, verificationStatus, rating, reviewCount, completionRate, createdAt }`
- Returns 404 if user not found

**POST /api/auth/logout** (auth required) → `{ message: string }`
- JWT is stateless — just return success, client discards token

### Step 3: Test

Start server: `cd server && node src/index.js`

Test registration:
```bash
curl -X POST http://localhost:5000/api/auth/register -H "Content-Type: application/json" -d '{"phone":"9801111111","password":"test123","name":"Test User","role":"seeker"}'
```

Test login:
```bash
curl -X POST http://localhost:5000/api/auth/login -H "Content-Type: application/json" -d '{"phone":"9801111111","password":"test123"}'
```

Test /me (use token from login):
```bash
curl http://localhost:5000/api/auth/me -H "Authorization: Bearer <token>"
```

### Step 4: Commit
```bash
git add server/src/middleware/auth.js server/src/routes/auth.js
git commit -m "feat(server): add JWT auth middleware and auth routes (register/login/logout/me)"
```

## Report file
`C:\Users\HP\Desktop\Kaarya mobile app\Kaarya\.superpowers\sdd\2026-09-03-kaarya-stage-2-backend\task-2-report.md`
