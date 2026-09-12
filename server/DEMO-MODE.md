# Demo / Test Account Mechanism (Verification Lifecycle)

For QA and local testing only. Never activates in production.

## How it works

`GET/POST` endpoints are mounted under `/api/dev/demo/` and are gated **per request**:

```
isDemoEnabled() === (DEMO_MODE === 'true') AND (NODE_ENV !== 'production')
```

Both conditions must hold. `NODE_ENV=production` always blocks these routes, so a
mistaken `DEMO_MODE=true` on the production Render service cannot activate them.

Endpoints:

| Endpoint                     | Purpose                                                                 |
| ---------------------------- | ------------------------------------------------------------------------ |
| `POST /api/dev/demo/bootstrap` | Idempotently create (or reuse) the demo seeker account; returns sign-in credentials + a bearer token. |
| `POST /api/dev/demo/reset`     | Wipe the demo user's `verification_requests` and clear their `verified` flag so the full lifecycle can be re-run. |

When disabled, both endpoints return `404 {"error":"Not found"}`.

## Demo account (same on every environment)

- Email: `demo@kaarya.dev`
- Phone: `9809000000`
- Password: `KaaryaDemo@123`
- Role: `seeker`, starts unverified.

**Sign in is the normal mobile email/password login with these credentials — no OTP
is involved**, because the demo route creates the account directly in the DB.

## How to enable

The demo mode is enabled by environment variables on the server, never in code:

```
DEMO_MODE=true
```

In a **non-production** Render/staging service (where `NODE_ENV != production`),
add `DEMO_MODE=true` in the service's Environment/vars section and redeploy/restart
so the var takes effect. Remove it after testing.

Locally:

```
DEMO_MODE=true npx node src/index.js
```

(On Windows PowerShell: `$env:DEMO_MODE="true"; npm start`, then clear it with
`Remove-Item Env:DEMO_MODE` when done.)

## How to use it to exercise the verification lifecycle

1. Bootstrap the account once:
   `POST /api/dev/demo/bootstrap`
2. In the mobile app, log in as `demo@kaarya.dev` / `KaaryaDemo@123`.
3. Open Verification → submit tier 3 (Manual Review) with selfie + citizenship photos.
4. In the admin panel, review the request → **Reject** with a note like
   "Photos too dark — please retake."
5. Back in the app: the Verification screen now shows the **rejected state with the
   admin's reason** and a **Resubmit Documents** button. Tap it, re-upload, submit.
6. Admin sees the new pending request (old rejected history preserved) → **Approve**.
7. App shows "Verification Approved"; user is now verified.
8. To repeat the whole cycle: `POST /api/dev/demo/reset`, then start again at step 3.

For direct API testing, `bootstrap`/`reset` also return a `token` you can pass as a
bearer token to `/api/verification/*`.