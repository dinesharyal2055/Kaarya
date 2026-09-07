# Kaarya — On-Demand Service Marketplace for Nepal

A mobile platform connecting service seekers (task posters) with service providers (taskers) in Nepal. Built with React Native, Expo Router v3, Express.js, and SQLite.

---

## 🏛️ System Architecture & Full Specifications

For complete technical specifications, database schemas, API references, identity verification rules, and security architecture, see:
👉 **[`ARCHITECTURE.md`](ARCHITECTURE.md)**

---

## 🚀 Tech Stack

- **Frontend**: Expo (SDK 57) + React Native + TypeScript + Expo Router v3
- **Styling**: NativeWind (Tailwind CSS) + React Native StyleSheet
- **Backend**: Node.js + Express.js REST API
- **Database**: SQLite with `sql.js` (WebAssembly with durable file-sync to `database.sqlite`)
- **Authentication**: JWT access tokens with JTI blocklist revocation on logout
- **Transactional Email**: Resend API (`@resend/node`) for 6-digit registration OTPs and password resets
- **Bilingual i18n**: `react-i18next` with `AsyncStorage` persistence (English ↔ Nepali)
- **Location Intelligence**: `expo-location` with privacy-shielded GPS coordinates
- **Media**: `expo-image-picker` for multi-photo task attachments, citizenship documents, and avatars

---

## 📱 Development Status

### ✅ Completed Stages (Stages 1 – 13)

| Stage | Feature | Description |
| :--- | :--- | :--- |
| **Stage 1** | **App Shell & Routing** | 13 core screens, file-based routing with Expo Router, AuthContext, Tab navigation. |
| **Stage 2–6** | **Authentication System** | Phone + password login, Resend 6-digit email OTPs, password reset, JWT token management. |
| **Stage 7** | **Chat & Avatar Upload** | Real-time chat polling (4s interval with unmount cleanup), multi-participant handling, avatar uploads. |
| **Stage 8** | **Ongoing Jobs & Reviews** | Job status engine (`open` ➔ `assigned` ➔ `in_progress` ➔ `completed`), bidirectional 1-5 star reviews. |
| **Stage 9** | **Full Bilingual Localization** | English ↔ Nepali (`en.json`, `ne.json`), profile language switcher, persistent storage. |
| **Stage 10** | **Counter-Offers & Bidding** | InDrive-style negotiation: providers submit custom bids; seekers accept/reject offers. |
| **Stage 11** | **Location & Privacy Shield** | Public job cards show general area; exact GPS coords + native Maps navigation unlock strictly to assigned provider. |
| **Stage 12** | **i18n Translation Audit** | 55+ missing localization keys identified and translated across all screens. |
| **Stage 13** | **Portfolio Screen** | View completed task history, rating breakdown, and verified client reviews. |
| **Security** | **Permanent Identity Verification** | Mandatory Citizenship/NID front+back + face selfie upload + manual admin approval required to post or bid. |

### ⏸️ On Hold

- **Push Notifications (FCM)**: Server helper ready; full E2E requires production APK/AAB build (`expo run:android`).
- **Payment Integration (eSewa / Khalti QR)**: Nepal uses QR-based escrow payments; on hold for dedicated merchant API research.

---

## 🏃 Quick Start

### 1. Start the Backend API
```bash
cd server
npm install
npm start
```
*Server runs on port 5000 (`http://localhost:5000` or local network IP).*

### 2. Start the Expo Mobile App
```bash
# In the root Kaarya directory
npm install
npx expo start
```
*Press `a` to run on Android Emulator, `i` for iOS Simulator, or scan the QR code with Expo Go.*

---

## 🛡️ Security & Identity Verification Flow

1. Newly registered users start as **Unverified** (`is_verified = 0`). Email OTP confirms email validity only.
2. Unverified users can browse and view all public jobs.
3. **Posting tasks** and **bidding on jobs** are strictly gated:
   - User navigates to `/verification` and uploads Citizenship Card / NID (front & back) + face photo.
   - Admin reviews documents in `/api/admin/verifications` and approves.
   - `is_verified` flips to `1`, granting full platform capabilities.

---

## 📂 Project Structure

```
Kaarya/
├── ARCHITECTURE.md          # Complete master architectural specification
├── README.md                # Project overview and quick start guide
├── src/
│   ├── app/                 # Expo Router v3 file-based screens
│   │   ├── (auth)/          # Login, Register, Forgot Password
│   │   ├── (tabs)/          # Home, Browse, Post, Messages, Profile
│   │   ├── job/[id].tsx     # Job Details & Bidding
│   │   ├── chat/[id].tsx    # Real-Time Conversation Screen
│   │   ├── verification.tsx # Document & Selfie Upload Flow
│   │   ├── portfolio.tsx    # User Portfolio & Reviews Screen
│   │   └── ...              # Edit Job, Post Job, Review, Settings
│   ├── context/             # AuthContext (JWT, user state, verification)
│   ├── i18n/                # en.json, ne.json, i18n initialization
│   └── lib/                 # API client (Axios/fetch with token auth)
└── server/
    ├── src/
    │   ├── index.js         # Express server entry point
    │   ├── db.js            # SQLite WASM initialization & persistence
    │   ├── mailer.js        # Resend API email service
    │   ├── middleware/      # requireAuth, validate, rate limiter
    │   ├── routes/          # auth, jobs, offers, verification, admin, reviews
    │   └── migrations/      # SQL database migration scripts
    └── .env                 # Server environment variables
```
