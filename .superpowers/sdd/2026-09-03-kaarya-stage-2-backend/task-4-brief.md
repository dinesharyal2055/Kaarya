# Task 4 Brief: Offers + Negotiations routes

## Plan Context
- Project: Kaarya mobile app (Expo/React Native)
- Root: `C:\Users\HP\Desktop\Kaarya mobile app\Kaarya`
- Server root: `C:\Users\HP\Desktop\Kaarya mobile app\Kaarya\server`
- Branch: master
- Task 3 BASE commit: e1f8ac363772781be5a19ee57a80d542d869e655

## Global Constraints (binding on this task)
- Server port: 5000
- All API responses: `{ data: ... }` or `{ error: string }`

## Context from previous tasks
- Database uses `sql.js` (async `getDb()`) — await before every query
- Jobs table: `id, seeker_id, title, description, category, location, budget_min, budget_max, status, urgency, scheduled_date, created_at, updated_at`
- Users table: `id, name, email, phone, password_hash, role, avatar_url, rating, review_count, is_verified, fcm_token, created_at, updated_at`
- Offers table: `id, job_id, provider_id, amount, message, status, created_at, updated_at`
- Negotiations table: `id, job_id, provider_id, seeker_id, proposed_amount, status, created_at, updated_at`
- `requireAuth` is synchronous — does NOT need await

## What to build
`server/src/routes/offers.js`

## Required endpoints

### POST /api/offers — submit offer (auth required, provider only)
- Body: `{ jobId, price, message?, estimatedArrival? }`
- 403 if not a provider
- 404 if job not found
- 400 if job not open (status != 'open')
- Return: offer object with providerName, providerAvatar, providerRating, providerCompletionRate, negotiations: []

### GET /api/offers/:id — get offer with negotiation history
- Auth required
- Return offer object with negotiations array
- 404 if not found

### POST /api/offers/:id/accept — accept offer (seeker only)
- 403 if not the job seeker
- 400 if offer not pending
- Update offer status to 'accepted'
- Update job status to 'assigned'
- Reject other pending offers on same job
- Return: `{ message, status }`

### POST /api/offers/:id/reject — reject offer
- 403 if not the job seeker
- Update offer status to 'rejected'
- Return: `{ message, status }`

### POST /api/offers/:id/withdraw — withdraw offer (provider only)
- 403 if not the provider
- Update offer status to 'withdrawn'
- Return: `{ message, status }`

### POST /api/offers/:id/counter — counter-offer (seeker only)
- Body: `{ price, message? }`
- 400 if price not provided
- 403 if not the job seeker
- Update original offer status to 'countered'
- Insert into negotiations table
- Return: new offer object (as counter)

### GET /api/offers/job/:jobId — list offers for a job
- Return: array of offer objects

## Field mapping
DB → API:
- `provider_id` → `providerId`
- `job_id` → `jobId`
- `created_at` → `createdAt`
- `amount` → `price`
- `rating` → `providerRating`
- `completion_rate` → `providerCompletionRate` (users table has `review_count` and `rating` only — use `null` for completionRate)
- `proposed_amount` → `price` (negotiations)
- `is_verified` → `providerVerified` (map 0/1 to boolean)

## Testing
Need a provider token. Register as provider, create an offer on job #1:

```bash
# Register provider
curl -X POST http://localhost:5000/api/auth/register -H "Content-Type: application/json" -d '{"phone":"9808888888","password":"test123","name":"Test Provider","role":"provider"}'

# Submit offer
curl -X POST http://localhost:5000/api/offers -H "Content-Type: application/json" -H "Authorization: Bearer <provider-token>" -d '{"jobId":1,"price":1000,"message":"I can fix it"}'

# Get offer
curl http://localhost:5000/api/offers/<offerId> -H "Authorization: Bearer <provider-token>"

# List offers for job
curl http://localhost:5000/api/offers/job/1
```

For accept/reject/counter — need a seeker token (use existing registered seeker).

## Commit
```bash
git add server/src/routes/offers.js
git commit -m "feat(server): add offers and negotiation routes"
```

## Report
`C:\Users\HP\Desktop\Kaarya mobile app\Kaarya\.superpowers\sdd\2026-09-03-kaarya-stage-2-backend\task-4-report.md`
