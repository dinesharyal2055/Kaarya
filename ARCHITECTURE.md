# Kaarya — Master System Architecture & Technical Specifications

This document serves as the permanent, single source of truth for the **Kaarya** mobile marketplace platform architecture, database schemas, security models, business rules, and API specifications.

---

## 1. System Overview & Value Proposition

**Kaarya** is a high-trust, on-demand service marketplace designed specifically for Nepal. It bridges the gap between **Service Seekers** (individuals/businesses posting tasks) and **Service Providers** (independent taskers/contractors seeking work).

```
┌────────────────────────────────────────────────────────────────────────┐
│                        MOBILE CLIENT (Expo / React Native)             │
│   • Expo Router v3 (File-based navigation)                             │
│   • TypeScript + React Native StyleSheet                               │
│   • react-i18next (English ↔ Nepali with AsyncStorage persistence)     │
│   • expo-location (GPS coordinate acquisition)                         │
│   • expo-image-picker (Citizenship docs, selfies, task photos)         │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ HTTPS / REST (JWT Auth)
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                        BACKEND API (Node.js / Express)                 │
│   • Express REST Router (Modular endpoints)                            │
│   • Security: Helmet headers, CORS, bcryptjs (10 rounds), JTI Blacklist│
│   • Transactional Email: Resend SDK (@resend/node)                     │
│   • Storage Engine: SQLite (sql.js WASM + File Sync to database.sqlite)│
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
           ┌────────────────────────┴────────────────────────┐
           ▼                                                 ▼
┌──────────────────────┐                         ┌───────────────────────┐
│  Resend Email API    │                         │  SQLite WASM Database │
│  (Real 6-digit OTPs  │                         │  (Durable disk-backed │
│   & Password Resets) │                         │   relational storage) │
└──────────────────────┘                         └───────────────────────┘
```

---

## 2. Permanent Core Security & Identity Verification Rule

> **MANDATORY POLICY**: Users registered on Kaarya start as **Unverified** (`is_verified = 0`). Email OTP verifies email deliverability ONLY, NOT legal identity.

### Identity Verification State Machine
```
[User Registration] ──> is_verified = 0 (Can ONLY browse jobs)
                               │
                               ▼
[Upload Citizenship Front/Back + Face Photo] ──> verification_requests (status: 'pending')
                               │
                               ▼
[Manual Admin Review in Dashboard]
        ├──> [Approve] ──> is_verified = 1 (Full Access: Post Tasks & Bid on Jobs)
        └──> [Reject]  ──> is_verified = 0 (Request marked 'rejected' with reason)
```

### Dual-Layer Gate Enforcement:
1. **Server-Side Enforcement**:
   - `POST /api/jobs` (Task Creation): Rejects with `403 Forbidden` if `user.is_verified !== 1`.
   - `POST /api/jobs/:id/offers` (Bidding): Rejects with `403 Forbidden` if `user.is_verified !== 1`.
2. **Client-Side Enforcement**:
   - `post.tsx`, `post-job.tsx`, `make-offer.tsx`, `job/[id].tsx`: Inspect `user.verificationStatus`. If not `'verified'`, intercept action with an Alert dialog redirecting the user directly to `/verification`.

---

## 3. Stages 1–13 Feature Breakdown

| Stage | Feature | Implementation Details |
| :--- | :--- | :--- |
| **Stage 1** | **App Shell & Core Navigation** | Expo Router v3, 13 core screens, AuthContext, Tab Navigator (Home, Browse, Post, Messages, Profile). |
| **Stage 2-6** | **Authentication & Security** | Phone/Password login, 6-digit email OTP verification, password reset, JWT token invalidation blocklist. |
| **Stage 7** | **Chat & Avatar Upload** | Real-time chat polling (every 4s with unmount cleanup), multi-participant detection, profile image uploads. |
| **Stage 8** | **Ongoing Jobs & Mutual Reviews** | `assigned` ➔ `in_progress` ➔ `completed` state engine. Mutual 1-5 star ratings + textual reviews. |
| **Stage 9** | **Full Bilingual Localization (i18n)** | Complete English ↔ Nepali localization (`react-i18next`), 20+ screens, inline language toggle, AsyncStorage persistence. |
| **Stage 10** | **Counter-Offers & Bidding** | InDrive-style negotiation: providers submit custom bids; seekers accept/reject directly. |
| **Stage 11** | **Location & Privacy Shield** | Public job cards display general neighborhood; exact GPS coords + native Maps navigation unlock strictly to assigned provider. |
| **Stage 12** | **i18n Key Audit** | 55+ missing localization keys identified and translated across all screens. |
| **Stage 13** | **Portfolio & Public Reputation** | Unified portfolio screen rendering ratings, completion stats, and review feeds. |
| **On Hold** | **FCM Push & QR Payments** | FCM server helper scaffolded (awaits production APK build); eSewa/Khalti QR escrow integration on hold for API specs. |

---

## 4. Database Schema Reference (SQLite / sql.js)

### Users Table (`users`)
```sql
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  phone TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT DEFAULT 'seeker', -- 'seeker' | 'provider' | 'admin'
  avatar_url TEXT,
  bio TEXT,
  is_verified INTEGER DEFAULT 0, -- 0 = unverified, 1 = verified
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### Verification Requests (`verification_requests`)
```sql
CREATE TABLE verification_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  document_type TEXT NOT NULL, -- 'citizenship' | 'nid' | 'passport'
  id_number TEXT,
  document_front_url TEXT NOT NULL,
  document_back_url TEXT NOT NULL,
  face_photo_url TEXT NOT NULL,
  status TEXT DEFAULT 'pending', -- 'pending' | 'approved' | 'rejected'
  rejection_reason TEXT,
  reviewed_by INTEGER REFERENCES users(id),
  reviewed_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### Jobs Table (`jobs`)
```sql
CREATE TABLE jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  seeker_id INTEGER NOT NULL REFERENCES users(id),
  category_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  photos TEXT, -- JSON array of image URLs
  budget_min REAL,
  budget_max REAL,
  location_name TEXT NOT NULL,
  seeker_lat REAL, -- Privacy-gated
  seeker_lng REAL, -- Privacy-gated
  status TEXT DEFAULT 'open', -- 'open' | 'assigned' | 'in_progress' | 'completed' | 'cancelled'
  assigned_provider_id INTEGER REFERENCES users(id),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### Offers / Bids Table (`offers`)
```sql
CREATE TABLE offers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id INTEGER NOT NULL REFERENCES jobs(id),
  provider_id INTEGER NOT NULL REFERENCES users(id),
  price REAL NOT NULL,
  message TEXT,
  status TEXT DEFAULT 'pending', -- 'pending' | 'accepted' | 'rejected'
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### Reviews Table (`reviews`)
```sql
CREATE TABLE reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id INTEGER NOT NULL REFERENCES jobs(id),
  reviewer_id INTEGER NOT NULL REFERENCES users(id),
  reviewee_id INTEGER NOT NULL REFERENCES users(id),
  rating INTEGER NOT NULL CHECK(rating >= 1 AND rating <= 5),
  comment TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### Conversations & Messages (`conversations`, `messages`)
```sql
CREATE TABLE conversations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id INTEGER REFERENCES jobs(id),
  seeker_id INTEGER NOT NULL REFERENCES users(id),
  provider_id INTEGER NOT NULL REFERENCES users(id),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id INTEGER NOT NULL REFERENCES conversations(id),
  sender_id INTEGER NOT NULL REFERENCES users(id),
  text TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

---

## 5. API Route Directory

### Authentication (`/api/auth`)
* `POST /api/auth/register/initiate`: Sends 6-digit OTP to user's email via Resend.
* `POST /api/auth/register/verify`: Validates OTP and creates user with `is_verified = 0`.
* `POST /api/auth/login`: Authenticates phone/password and returns signed JWT.
* `POST /api/auth/forgot-password`: Generates 15-minute reset code via Resend.
* `POST /api/auth/verify-reset-otp`: Validates reset code.
* `POST /api/auth/reset-password`: Commits new password hash.
* `POST /api/auth/logout`: Invalidates active JWT via JTI blocklist.

### Verification (`/api/verification`)
* `POST /api/verification/submit`: Submits front/back documents + face selfie.
* `GET /api/verification/status`: Retrieves current submission status (`none`, `pending`, `approved`, `rejected`).

### Admin Management (`/api/admin`)
* `GET /api/admin/verifications`: Lists pending verification requests.
* `POST /api/admin/verifications/:id/approve`: Flips `users.is_verified = 1` and marks request `approved`.
* `POST /api/admin/verifications/:id/reject`: Records rejection note and keeps `is_verified = 0`.

### Jobs & Bidding (`/api/jobs`)
* `GET /api/jobs`: Filtered search (category, status, search query, budget).
* `POST /api/jobs`: Creates task. *(Strictly requires `is_verified = 1`)*.
* `GET /api/jobs/:id`: Returns job details. Includes `seeker_lat`/`seeker_lng` **only if** requester is task poster or accepted provider.
* `PATCH /api/jobs/:id`: Updates job details (open status only).
* `POST /api/jobs/:id/offers`: Submits bid. *(Strictly requires `is_verified = 1`)*.
* `PATCH /api/offers/:id/accept`: Accepts bid, transitions job to `assigned`, rejects competing offers.

---

## 6. Location Privacy Architecture

```
[Public User / Browsing Provider]
        │
        ▼
   GET /jobs/:id ──> Returns general area (e.g., "Baluwatar, Kathmandu")
                     seeker_lat: null, seeker_lng: null

[Accepted Provider (Offer Approved)]
        │
        ▼
   GET /jobs/:id ──> Returns exact coordinates (27.7215° N, 85.3301° E)
                     Enables native "Open in Apple Maps / Google Maps" button
```

---

## 7. Email Dispatch Architecture (Resend API)

* **SDK**: Official `@resend/node` package.
* **Environment Configuration**: `RESEND_API_KEY`, `FROM_EMAIL=Kaarya <onboarding@resend.dev>`.
* **Templates**:
  1. **Registration OTP**: Branded HTML card with 6-digit confirmation code.
  2. **Password Reset**: Security-themed template with 15-minute expiration countdown notice.

---

## 8. Development & Production Operations

### Environment Variables (`server/.env`)
```env
PORT=5000
JWT_SECRET=your_super_secure_jwt_secret_key_here
RESEND_API_KEY=re_your_resend_api_key_here
FROM_EMAIL=Kaarya <onboarding@resend.dev>
NODE_ENV=development
```

### Service Run Commands
```bash
# Backend Server
cd "server"
npm start

# Expo Mobile Client
npx expo start
```
