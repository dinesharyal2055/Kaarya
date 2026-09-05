# SDD ledger — plan: docs/superpowers/plans/2026-09-03-kaarya-stage-2-backend.md
# Kaarya Stage 2: Real Express+SQLite+JWT Backend

## Plan context
- Project: Kaarya mobile app (Expo/React Native)
- Root: C:\Users\HP\Desktop\Kaarya mobile app\Kaarya
- Server root: C:\Users\HP\Desktop\Kaarya mobile app\Kaarya\server
- Branch: master
- GitHub: https://github.com/dinesharyal2055/Kaarya

## Global Constraints
- Node.js 18+
- Server port: 5000
- Mobile BASE_URL: http://192.168.1.79:5000/api
- JWT expiry: 7 days
- SQLite at server/database.sqlite
- bcrypt 10 rounds
- API paths must match src/lib/api.ts exactly
- Seed: 8 demo jobs pre-loaded

## Task Status
- [x] Task 1: Server scaffolding (package.json, db.js, index.js) ✅ — commit f39356c
- Ruling: sql.js replaces better-sqlite3 (Node v24 lacks prebuilt binary, Python not installed) — ACCEPTABLE
- Ruling: Schema column names differ from brief (location/area, amount/price, content/text) — acceptable, routes layer handles camelCase translation
- [x] Task 2: Auth middleware + routes ✅ — commits 58666f9 + 57a06cc
- `??` fix for rating:0 preservation — clean
- [x] Task 3: Jobs routes ✅ — commit e1f8ac3
- [x] Task 4: Offers + Negotiations routes ✅ — commit b0c4649
- [x] Task 5: Conversations + Messages routes ✅ — commit 5793e47
- [x] Task 6: Wire mobile to server + final testing ✅ — commit 88fc2e9, pushed to GitHub
- [x] Task 7: Update project memory ✅
