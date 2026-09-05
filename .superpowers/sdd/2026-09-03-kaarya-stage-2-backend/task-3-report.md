# Task 3 Report: Jobs CRUD Routes

## Status: COMPLETE

## Commit
- Hash: `e1f8ac3`
- Message: `feat(server): add jobs CRUD routes with filtering and pagination`
- File: `server/src/routes/jobs.js` (241 lines)

## Implementation Summary

Created `server/src/routes/jobs.js` with four endpoints:

### 1. GET /api/jobs — List jobs with filters
- Supports `?category=`, `?location=`, `?status=`, `?page=` query params
- Returns `{ jobs: [...], total: N, page: N, pageSize: 20 }`
- Joins with users table for `seekerName` and `seekerAvatar`
- Includes `offerCount` per job
- Orders by `created_at DESC`

### 2. GET /api/jobs/:id — Single job
- Returns full job object with `seekerName`, `seekerAvatar`, `offerCount`
- Returns 404 if not found

### 3. POST /api/jobs — Create job
- Auth required (JWT via `Authorization: Bearer <token>`)
- Only `seeker` role allowed (403 otherwise)
- Required: `title`, `description`, `category`, `location`
- Returns 201 with created job object

### 4. PUT /api/jobs/:id/status — Update status
- Auth required, owner (seeker) only (403 otherwise)
- Valid statuses: `open`, `assigned`, `in_progress`, `completed`, `cancelled`
- Returns `{ message, status }`

## Test Results

| Test | Endpoint | Result |
|------|----------|--------|
| List all jobs | GET /api/jobs | PASS — returned 8 seeded jobs, total=8, pageSize=20 |
| Filter by category | GET /api/jobs?category=plumbing | PASS — returned 1 job (plumbing) |
| Get single job | GET /api/jobs/1 | PASS — returned job with offerCount=0 |
| Register seeker | POST /api/auth/register | PASS — token issued for user ID 3 |
| Create job (seeker) | POST /api/jobs | PASS — 201, created job ID 9 with status=open |
| Create job (provider) | POST /api/jobs | PASS — 403 "Only seekers can post jobs" |
| Update status | PUT /api/jobs/9/status | PASS — status changed to "in_progress" |
| Verify status | GET /api/jobs/9 | PASS — status confirmed as "in_progress" |

## Field Mapping Verified
- `location` DB column correctly mapped to `area` in API response
- `budget_min` → `budgetMin`, `budget_max` → `budgetMax`
- `seeker_id` → `seekerId`, `created_at` → `createdAt`

## Notes
- File already existed with correct implementation; all endpoints were already properly written
- Tested with actual HTTP requests against running server on port 5000
- Seeded 8 demo jobs from `db.js` are accessible via the list endpoint
- No issues found — all endpoints behave correctly
