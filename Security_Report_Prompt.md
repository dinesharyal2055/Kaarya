# Kaarya Security Hardening — Continue From Audit

We've already completed these fixes:
- ✅ Removed hardcoded JWT fallback secret (auth.js)
- ✅ Added Helmet middleware (index.js)
- ✅ Removed hardcoded demo password from source → DEMO_PASSWORD env var (db.js)
- ✅ Fixed ratingNum crash in reviews.js
- ✅ Added requireAuth + requireAdmin to all admin routes (admin.js)
- ✅ Fixed async error propagation + Zod error access in validate.js

## Remaining fixes (in priority order):

### P0 — Do these first

**1. Fix mailer.js** (`server/src/mailer.js`):
The mailer uses hardcoded `'REDACTED_MAILTRAP_USER'` and `'REDACTED_MAILTRAP_PASS'` instead of reading from `process.env.MAILTRAP_USER` and `process.env.MAILTRAP_PASS`. Add `try { require('dotenv').config(); } catch (_) {}` at the top and replace the hardcoded strings with env var reads. This is why OTP emails and password resets silently fail.

**2. Replace Math.random() with crypto.randomInt()** (`server/src/routes/auth.js` line ~76):
```js
function generateOTP() {
  return String(Math.floor(100000 + Math.random() * 900000));
}
```
Replace with:
```js
function generateOTP() {
  return String(crypto.randomInt(100000, 1000000));
}
```
`Math.random()` is not cryptographically secure. Use `crypto.randomInt()` from Node's built-in `crypto` module (already available).

**3. Increment OTP attempts column on wrong OTP** (`server/src/routes/auth.js`):
The `attempts` column in `otp_codes` is checked but **never incremented** on wrong attempts. Find every wrong-OTP branch in the verify routes (register/verify, forgot-password/verify, forgot-password/reset) and add:
```js
db.run('UPDATE otp_codes SET attempts = attempts + 1 WHERE id = ?', [otpId]);
```
This makes the 5-attempt lockout actually work.

### P1 — Do these next

**4. Enable rate limiting by default** (`server/src/middleware/rateLimit.js`):
The `skipIfDev` function skips rate limits when NODE_ENV !== 'production'. Either flip the default or add an explicit opt-out flag. Auth endpoints must have rate limiting on in all environments.

**5. Extract Firebase Admin credentials from git** (`server/src/firebase-service-account.json`):
- Add `firebase-service-account.json` to `server/.gitignore`
- Update `server/src/fcm.js` to load credentials from `process.env.FIREBASE_PROJECT_ID`, `process.env.FIREBASE_PRIVATE_KEY`, `process.env.FIREBASE_CLIENT_EMAIL` instead of reading from the JSON file

**6. Replace hardcoded local IP 192.168.1.79** (7 files in app):
- `app/src/lib/api.ts`
- `app/src/services/jobs.ts`
- `app/src/app/edit-profile.tsx`
- `app/src/app/offers.tsx`
- `app/src/app/portfolio.tsx`
- `app/src/app/edit-job.tsx`
- `app/src/app/job/[id].tsx`
Load the API URL from environment config (e.g., `Constants.expoConfig?.extra?.apiUrl`) instead of hardcoding it.

**7. Add JWT token revocation blocklist** (`server/src/middleware/auth.js`):
Add a `jwt_blocklist` table to `db.js` and check it on every `requireAuth` call. When a user logs out, add their token's JTI or `exp` to the blocklist. This prevents stolen tokens from being used even before expiry.

**8. AsyncStorage → SecureStore for JWT** (`app/src/lib/storage.ts`, `app/src/context/AuthContext.tsx`):
Replace `AsyncStorage.setItem('kaarya_token', ...)` with `SecureStore.setItemAsync('kaarya_token', ...)` from `expo-secure-store`. The JWT is currently stored in plain AsyncStorage which is world-readable on Android.

### P2 — Do these when time allows

**9. Generate strong JWT secret in .env**: Run `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"` and replace the current weak phrase.

**10. Implement JWT refresh token flow**: Add a `/auth/refresh` endpoint with short-lived access tokens (15 min) + refresh token rotation.

**11. Restrict Firebase API key** in Firebase Console → Project Settings → API Key restrictions. Set "Application restrictions" to Android apps only, add package name `com.kaarya.mobile` and SHA-1 fingerprints.

## Context
- Backend: `C:/Users/HP/Desktop/Kaarya mobile app/Kaarya/server/`
- App: `C:/Users/HP/Desktop/Kaarya mobile app/Kaarya/app/` (or wherever the Expo app lives)
- Server runs on port 5000
- Auth: JWT with 7-day expiry, bcrypt with 10 rounds
- Demo accounts: admin@kaarya.demo (id=1, is_admin=1), ganesh/abhinav/dinesh/suman @kaarya.demo
- Demo password: read from DEMO_PASSWORD env var
- Tests at `server/tests/admin-auth.test.js` (17 passing)
- Full audit summary in Claude memory: [[kaarya-security-audit]]

After each fix, run the security scan:
```
grep -rn "Math.random" server/src/
grep -rn "REDACTED_MAILTRAP" server/src/
grep -rn "demo1234" server/src/
```
And run existing tests: `npx jest server/tests/`
