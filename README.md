# Kaarya — On-Demand Service Marketplace for Nepal

A mobile app connecting service seekers (task posters) with service providers (taskers) in Nepal. Built with Expo + React Native.

## Tech Stack

- **Frontend**: Expo (SDK 57) + React Native 0.86 + TypeScript
- **Backend**: Express.js (Node.js) + SQLite (sql.js)
- **Styling**: NativeWind (Tailwind CSS) + React Native StyleSheet
- **Auth**: JWT tokens with email OTP verification via Mailtrap
- **i18n**: i18next with AsyncStorage persistence (English + Nepali)
- **Push Notifications**: Firebase Cloud Messaging (FCM) — **on hold** (see below)
- **Payments**: eSewa / Khalti QR-based — **on hold** (see below)

## Development Status

### ✅ Completed Stages

| Stage | Feature |
|-------|---------|
| 1 | App shell — all 13 screens, auth flow, tab navigation |
| 7 | Real-time chat with polling, avatar upload |
| 7 | Notification preferences (in-app) |
| 8 | Ongoing jobs tab, bidirectional reviews, star rating |
| 9 | Full bilingual (English ↔ Nepali) i18n |
| — | Firebase Cloud Messaging (FCM) server helper setup |

### ⏸️ On Hold

**Push Notifications (FCM)**
Push notifications are set up on the server side, but ExpoGo does not support receiving push notifications in development. Full E2E integration requires a production build (`expo run:android`). Will revisit once the app is built as a standalone APK/AAB.

**Payment Integration (eSewa / Khalti QR)**
Nepal uses a QR-based payment system rather than card-based. Payment integration requires deep research into Khalti/eSewa merchant APIs and QR code generation/wallet SDKs. This is a significant piece of work that needs dedicated research before implementation.

### 🔜 What's Next

- **Stage 10**: Counter-offer / negotiation flow (InDrive-style bid negotiation)
- **Stage 11**: Provider portfolio and service showcase pages
- **Stage 12**: Review display on job cards and profiles
- **Stage 13**: Advanced search, filtering, and sorting
- **Stage 14**: Deep linking and shareable job links
- **Stage 15**: Offline support and data persistence
- **Stage 16**: Payment integration (eSewa/Khalti QR — TBD research)
- **Stage 17**: Push notifications E2E (requires production build)

## Running the App

```bash
# Start the backend server (terminal 1)
cd server
npm start

# Start Expo dev server (terminal 2)
npx expo start

# Run on Android emulator
npx expo run:android

# Run on iOS simulator
npx expo run:ios
```

## Key Screens

- **Auth**: Login, Register (with email OTP), Forgot Password
- **Home**: Greeting, recent tasks, quick actions
- **Browse**: Job listings with filters and search
- **Post a Task**: 5-step wizard (category → details → photos → budget → confirm)
- **Job Detail**: Full job info, offer list, accept/decline
- **Make Offer**: Submit bid with price and message
- **My Jobs**: Ongoing and saved jobs
- **Messages**: Real-time chat with providers/seekers
- **Profile**: User info, mode switch, verification, settings
- **Edit Profile**: Name, bio, avatar upload
- **Verification**: Tiered identity verification (Nagarik App / eSewa-Khalti / Manual)
- **Notifications**: In-app notification center

## API

- **Base URL**: `http://192.168.1.79:5000/api` (local dev)
- **Auth**: `POST /auth/login`, `POST /auth/register/initiate`, `POST /auth/register/verify`
- **Jobs**: `GET/POST /jobs`, `GET/PATCH/DELETE /jobs/:id`
- **Offers**: `GET/POST /jobs/:id/offers`, `PATCH /offers/:id/accept|reject`
- **Messages**: `GET /conversations`, `GET /conversations/:id/messages`, `POST /conversations/:id/messages`
- **Reviews**: `POST /jobs/:id/reviews`, `GET /users/:id/reviews`

## Environment

- **Server port**: 5000
- **Email (dev)**: Mailtrap SMTP — sandbox.smtp.mailtrap.io:2525
- **Database**: SQLite via sql.js (WASM)

## Last Updated

**Date**: 2026-09-06
