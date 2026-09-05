# Task 1 Brief: Server scaffolding — package.json, db.js, index.js

## Plan Context
- Project: Kaarya mobile app (Expo/React Native)
- Root: `C:\Users\HP\Desktop\Kaarya mobile app\Kaarya`
- Server root: `C:\Users\HP\Desktop\Kaarya mobile app\Kaarya\server`
- Branch: master

## Global Constraints (binding on this task)
- Node.js 18+
- Server runs on port 5000
- Mobile app expects API at `http://192.168.1.79:5000/api`
- SQLite file at `server/database.sqlite`
- All API responses: `{ data: ... }` wrapper or `{ error: string }` on failure
- Mobile already has all API methods defined in `src/lib/api.ts` — server must match those exact paths

## What to build
Three files: `server/package.json`, `server/src/db.js`, `server/src/index.js`

## Interfaces
- `db.js` exports `getDb()` — returns singleton SQLite database instance (better-sqlite3)
- `index.js` starts Express server on port 5000, enables CORS, mounts all route prefixes

## Step-by-step

### Step 1: Create `server/package.json`
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

### Step 2: Create `server/src/db.js`
Create the file with:
- `getDb()` singleton using `better-sqlite3`
- SQLite WAL mode enabled
- Schema: users, jobs, offers, negotiations, conversations, conversation_participants, messages, notifications tables (CREATE TABLE IF NOT EXISTS)
- Seed 8 demo jobs (id 2 as seeker_id) if table is empty:
  1. Fix leaking kitchen tap | plumbing | Thamel | 800-1200
  2. Paint 2 bedroom walls | painting | Lazimpat | 8000-12000
  3. AC not cooling properly | appliance | Jhamsikhel | 2000-3500
  4. Move 3-seater sofa to 2nd floor | moving | Kumaripati | 1500-2000
  5. Deep clean 2BHK apartment | cleaning | Baneshwor | 3500-5000
  6. Fix electrical switchboard | electrical | Putalisadak | 500-800
  7. Assemble IKEA wardrobes | carpentry | Samakhushi | 2500-4000
  8. Computer virus removal | appliance | Maharajgunj | 1000-1500

### Step 3: Create `server/src/index.js`
Create the file with:
- Express app, CORS enabled (origin: '*'), express.json()
- Health check: GET /api/health → `{ status: 'ok', timestamp: ... }`
- Route prefixes (placeholders for now — they'll be filled in by later tasks):
  - app.use('/api/auth', authRoutes)  ← require('./routes/auth')
  - app.use('/api/jobs', jobsRoutes) ← require('./routes/jobs')
  - app.use('/api/offers', offersRoutes) ← require('./routes/offers')
  - app.use('/api/conversations', conversationsRoutes) ← require('./routes/conversations')
- Error handler (err → 500 JSON)
- Listen on port 5000, 0.0.0.0
- ASCII banner on startup

Note: The require() calls for routes will fail at startup since the route files don't exist yet — use try/catch or dummy exports to keep the server starting for now. The placeholder approach is fine:
```js
let authRoutes, jobsRoutes, offersRoutes, conversationsRoutes;
try { authRoutes = require('./routes/auth'); } catch(e) { authRoutes = express.Router(); }
```
Or just mount the router stubs and let later tasks fill them in.

### Step 4: Install deps and test
```bash
cd server && npm install
node src/index.js
```
Open: http://localhost:5000/api/health
Expected: `{"status":"ok","timestamp":"..."}`

### Step 5: Commit
```bash
git add server/package.json server/src/db.js server/src/index.js
git commit -m "feat(server): scaffold Express + SQLite backend, health check endpoint"
```

## Report file
Write the full report to:
`C:\Users\HP\Desktop\Kaarya mobile app\Kaarya\.superpowers\sdd\2026-09-03-kaarya-stage-2-backend\task-1-report.md`

After committing, report back: status, commit hash, test result, any concerns.
