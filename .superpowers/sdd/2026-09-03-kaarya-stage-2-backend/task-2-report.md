# Task 2 Report: Auth middleware + routes

**Status:** COMPLETE
**Commit:** `57a06cc` (two commits total — see below)
**Branch:** master

---

## Files created

1. `server/src/middleware/auth.js` — JWT + bcrypt utilities
2. `server/src/routes/auth.js` — register/login/logout/me endpoints

---

## Commits

```
58666f9 feat(server): add JWT auth middleware and auth routes (register/login/logout/me)
57a06cc fix(server): include rating:0 in user responses (nullish coalescing)
```

---

## Test results

### POST /api/auth/register
```
POST http://localhost:5000/api/auth/register
Body: {"phone":"9805555555","password":"final123","name":"Final Test","role":"provider"}
Response: 201
{
  "token": "eyJh...",
  "user": {
    "id": "4",
    "phone": "9805555555",
    "name": "Final Test",
    "role": "provider",
    "verificationStatus": null,
    "rating": 0,
    "reviewCount": 0,
    "completionRate": 0,
    "createdAt": "2026-09-03 17:58:49"
  }
}
```

### POST /api/auth/login
```
POST http://localhost:5000/api/auth/login
Body: {"phone":"9805555555","password":"final123"}
Response: 200
{
  "token": "eyJh...",
  "user": { same shape as register response }
}
```

### GET /api/auth/me
```
GET http://localhost:5000/api/auth/me
Header: Authorization: Bearer <token>
Response: 200
{
  "id": "4",
  "phone": "9805555555",
  "name": "Final Test",
  "role": "provider",
  "verificationStatus": null,
  "rating": 0,
  "reviewCount": 0,
  "completionRate": 0,
  "createdAt": "2026-09-03 17:58:49"
}
```

### POST /api/auth/logout
```
POST http://localhost:5000/api/auth/logout
Header: Authorization: Bearer <token>
Response: 200
{ "message": "Logged out successfully" }
```

All four endpoints return the correct HTTP status codes and response shapes matching the mobile API types from `src/lib/api.ts` and `src/types/index.ts`.

---

## Notes

- Used `??` (nullish coalescing) instead of `||` for `rating` and `reviewCount` so that a value of `0` is preserved in the JSON response.
- Users table has no `verification_status` or `completion_rate` columns — `verificationStatus: null` and `completionRate: 0` are returned as per the brief's instructions.
- JWT is stateless; logout simply returns success — the client is responsible for discarding the token.
- Server auto-loads the auth routes via the `require()` call in `src/index.js`.
- All DB queries use async `getDb()` as required.

---

## Concerns

- No email verification flow — registration accepts any phone number without OTP verification.
- No FCM token persistence (column exists but not updated on register/login).
- The demo user seeded by Task 1 uses a placeholder bcrypt hash — it cannot be logged in with a real password.
