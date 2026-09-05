# Task 6 Brief: Wire mobile to server + final testing

## Plan Context
- Project: Kaarya mobile app (Expo/React Native)
- Root: `C:\Users\HP\Desktop\Kaarya mobile app\Kaarya`
- Server root: `C:\Users\HP\Desktop\Kaarya mobile app\Kaarya\server`
- Branch: master
- Task 5 BASE commit: 5793e4776431b3891f5e35f1e48c0322bb9a053b

## What to verify
This task is a verification + wiring pass — mobile already has all the API code correct.

## Step 1: Verify `src/lib/api.ts` BASE_URL
Read `C:\Users\HP\Desktop\Kaarya mobile app\Kaarya\src\lib\api.ts` and confirm `BASE_URL` is `http://192.168.1.79:5000/api`.
If it differs, update it.

## Step 2: Full end-to-end flow test
Test the complete user journey with curl:

```bash
# 1. Health check
curl http://localhost:5000/api/health

# 2. Register as seeker
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"phone":"9809999001","password":"test123","name":"Flow Seeker","role":"seeker"}'

# 3. Register as provider
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"phone":"9809999002","password":"test123","name":"Flow Provider","role":"provider"}'

# 4. Login as provider, extract token
curl -s -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"phone":"9809999002","password":"test123"}' > /tmp/provider-login.json
# Extract token: (Windows compatible using PowerShell)
powershell -Command "$j=Get-Content /tmp/provider-login.json -Raw|ConvertFrom-Json;$j.token"

# 5. Browse jobs
curl http://localhost:5000/api/jobs | jq '.jobs | length'

# 6. Filter by category
curl "http://localhost:5000/api/jobs?category=plumbing" | jq '.jobs | length'

# 7. Submit offer on job #1
curl -X POST http://localhost:5000/api/offers \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <provider-token>" \
  -d '{"jobId":1,"price":1000,"message":"I can fix it today"}'
```

Expected results:
- Health: 200 `{status:"ok"}`
- Register: 201 with token + user
- Login: 200 with token + user
- Jobs list: 200 with 8 jobs
- Filter: 200 with 1 plumbing job
- Submit offer: 201

## Step 3: Commit mobile changes (if BASE_URL was updated)
```bash
git add src/lib/api.ts
git commit -m "chore(mobile): ensure api.ts BASE_URL matches server"
```

## Step 4: Push to GitHub
```bash
git add server/
git commit -m "feat: add full Express+SQLite backend (Stage 2)"
git push origin master
```

## Report
`C:\Users\HP\Desktop\Kaarya mobile app\Kaarya\.superpowers\sdd\2026-09-03-kaarya-stage-2-backend\task-6-report.md`
