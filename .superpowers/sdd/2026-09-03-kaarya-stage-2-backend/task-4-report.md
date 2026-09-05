# Task 4 Report: Offers + Negotiations Routes

## Status: COMPLETE

## Commit

```
commit b0c4649
feat(server): add offers and negotiation routes

1 file changed, 411 insertions(+)
create mode 644 server/src/routes/offers.js
```

## Implementation

File created: `C:\Users\HP\Desktop\Kaarya mobile app\Kaarya\server\src\routes\offers.js`

### Endpoints Implemented

| Endpoint | Method | Auth | Who | Status |
|---|---|---|---|---|
| `/api/offers` | POST | required | provider | Done |
| `/api/offers/:id` | GET | required | any | Done |
| `/api/offers/:id/accept` | POST | required | seeker | Done |
| `/api/offers/:id/reject` | POST | required | seeker | Done |
| `/api/offers/:id/withdraw` | POST | required | provider | Done |
| `/api/offers/:id/counter` | POST | required | seeker | Done |
| `/api/offers/job/:jobId` | GET | none | public | Done |

### Key Design Decisions

- Uses async `getDb()` before every query (sql.js singleton pattern)
- `requireAuth` used synchronously (no await needed — sets `req.userId`)
- `providerCompletionRate` always returns `null` (no `completion_rate` column in users table)
- `is_verified` (0/1) mapped to `providerVerified` boolean
- `amount` / `proposed_amount` mapped to `price` in API responses
- `GET /api/offers/job/:jobId` is public (no auth required) per brief
- Status checks added for withdraw and counter to prevent actions on non-pending offers

### Accept Logic

- Updates offer status to `accepted`
- Updates job status to `assigned`
- Rejects all other pending offers on the same job

### Counter Logic

- Updates original offer status to `countered`
- Inserts into `negotiations` table with `status: 'open'`
- Returns a counter-offer object with `isCounter: true` and `originalOfferId`

## Test Results

All endpoints tested successfully:

```
POST /api/offers          -> 201, correct shape with providerName/Rating/Verified
GET /api/offers/1         -> 200, includes negotiations array
GET /api/offers/job/9     -> 200, returns {offers: [...]} wrapper
POST /api/offers/1/accept -> 200, job status changed to 'assigned'
POST /api/offers/3/reject -> 200, offer status 'rejected'
POST /api/offers/4/withdraw -> 200, offer status 'withdrawn'
POST /api/offers/5/counter -> 201, negotiation inserted, counter returned
```

Error cases:

```
POST /api/offers (as seeker)        -> 403 "Only providers can submit offers"
POST /api/offers (non-existent job) -> 404 "Job not found"
POST /api/offers (job not open)     -> 400 "Job is not open for offers"
GET  /api/offers/99999              -> 404 "Offer not found"
POST /api/offers/1/accept (wrong user) -> 403
POST /api/offers/4/withdraw (wrong user) -> 403
POST /api/offers/4/withdraw (not pending) -> 400
POST /api/offers/5/counter (missing price) -> 400
POST /api/offers/5/counter (not pending) -> 400
POST /api/offers/5/counter (as provider) -> 400 (status check runs before role check)
```

## Files Modified

- `server/src/routes/offers.js` (created, 411 lines)
