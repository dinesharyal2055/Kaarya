# Task 3 Brief: Jobs routes

## Plan Context
- Project: Kaarya mobile app (Expo/React Native)
- Root: `C:\Users\HP\Desktop\Kaarya mobile app\Kaarya`
- Server root: `C:\Users\HP\Desktop\Kaarya mobile app\Kaarya\server`
- Branch: master
- Task 2 BASE commit: 57a06cc

## Global Constraints (binding on this task)
- Server port: 5000
- Mobile API at `http://192.168.1.79:5000/api`
- All API responses: `{ data: ... }` or `{ error: string }`

## Context from previous tasks
- Database uses `sql.js` (async `getDb()`) — await before every query
- Jobs table columns: `id, seeker_id, title, description, category, location, budget_min, budget_max, status, urgency, scheduled_date, created_at, updated_at`
  - NOTE: uses `location` not `area`, `amount` is not a column (budget_min/budget_max are separate)
- Users table: `id, name, email, phone, password_hash, role, avatar_url, rating, review_count, is_verified, fcm_token, created_at, updated_at`
- Auth middleware exports `requireAuth` — sets `req.userId` after JWT verify
- `requireAuth` is synchronous, does NOT need await

## What to build
`server/src/routes/jobs.js`

## Required endpoints

### GET /api/jobs
List jobs with optional filters. Query params: `?category=&location=&status=&page=`
- Return: `{ jobs: [...], total: N, page: N, pageSize: 20 }`
- Join with users to get `seekerName` and `seekerAvatar`
- Include `offerCount` (SELECT COUNT(*) FROM offers WHERE job_id = j.id)
- Order by created_at DESC
- PAGE_SIZE = 20

### GET /api/jobs/:id
Get single job with offer count.
- Return: job object with seekerName, seekerAvatar, offerCount
- 404 if not found

### POST /api/jobs
Create job. Auth required. Only seekers can post.
- Body: `{ title, description, category, location, address?, budgetMin?, budgetMax?, negotiationMode?, photoUrls? }`
- 403 if not a seeker
- 400 if missing required fields (title, description, category, location)
- Return: created job object (201)

### PUT /api/jobs/:id/status
Update job status. Auth required. Only owner (seeker) can update.
- Body: `{ status }`
- Valid statuses: 'open', 'assigned', 'in_progress', 'completed', 'cancelled'
- 403 if not the job owner
- Return: `{ message, status }`

## Field name mapping (DB → API)
DB column → API field:
- `location` → `area`
- `budget_min` → `budgetMin`
- `budget_max` → `budgetMax`
- `seeker_id` → `seekerId`
- `created_at` → `createdAt`
- `updated_at` → `updatedAt`

## Testing
```bash
# List all jobs
curl http://localhost:5000/api/jobs

# Filter by category
curl "http://localhost:5000/api/jobs?category=plumbing"

# Get single job
curl http://localhost:5000/api/jobs/1

# Create job (use seeker token from Task 2)
curl -X POST http://localhost:5000/api/jobs \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <seeker-token>" \
  -d '{"title":"Test Job","description":"Test desc","category":"cleaning","location":"Thamel"}'
```

## Commit
```bash
git add server/src/routes/jobs.js
git commit -m "feat(server): add jobs CRUD routes with filtering and pagination"
```

## Report
`C:\Users\HP\Desktop\Kaarya mobile app\Kaarya\.superpowers\sdd\2026-09-03-kaarya-stage-2-backend\task-3-report.md`
