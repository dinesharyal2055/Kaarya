# Task 5 Brief: Conversations + Messages routes

## Plan Context
- Project: Kaarya mobile app (Expo/React Native)
- Root: `C:\Users\HP\Desktop\Kaarya mobile app\Kaarya`
- Server root: `C:\Users\HP\Desktop\Kaarya mobile app\Kaarya\server`
- Branch: master
- Task 4 BASE commit: b0c4649d20ac06ae6e41776b7c1f0c939ccc4a7c

## Global Constraints (binding on this task)
- Server port: 5000
- All API responses: `{ data: ... }` or `{ error: string }`

## Context from previous tasks
- Database uses `sql.js` (async `getDb()`) — await before every query
- Jobs table: `id, seeker_id, title, description, category, location, budget_min, budget_max, status, urgency, scheduled_date, created_at, updated_at`
- Users table: `id, name, email, phone, password_hash, role, avatar_url, rating, review_count, is_verified, fcm_token, created_at, updated_at`
- Conversations table: `id, job_id, created_at, updated_at`
- conversation_participants: `id, conversation_id, user_id`
- Messages table: `id, conversation_id, sender_id, content, is_read, created_at`
- `requireAuth` is synchronous

## What to build
`server/src/routes/conversations.js`

## Required endpoints

### GET /api/conversations — list user's conversations
- Auth required
- Return array of conversations the user is a participant in
- Each conversation includes: jobId, jobTitle, participants, lastMessage, unreadCount
- Order by created_at DESC

### GET /api/conversations/:id — get conversation details
- Auth required
- 404 if not found
- 403 if user not a participant
- Return: { id, jobId, jobTitle, participants, createdAt }

### GET /api/conversations/:id/messages — get messages
- Auth required
- 403 if not a participant
- Mark messages as read (is_read = 1) for messages not from this user
- Return: array of { id, conversationId, senderId, text, createdAt, readAt }

### POST /api/conversations/:id/messages — send message
- Auth required
- 400 if missing text
- 403 if not a participant
- 404 if conversation not found
- Insert message, return created message
- Also mark as read by sender immediately

## Field mapping
- DB `content` → API `text`
- DB `is_read` (0/1) → API `readAt` (null if 0, timestamp if 1)
- DB `created_at` → API `createdAt`

## Testing
```bash
# List conversations (empty)
curl http://localhost:5000/api/conversations -H "Authorization: Bearer <token>"

# Get conversation (if ID exists)
curl http://localhost:5000/api/conversations/1 -H "Authorization: Bearer <token>"

# Send message
curl -X POST http://localhost:5000/api/conversations/1/messages -H "Content-Type: application/json" -H "Authorization: Bearer <token>" -d '{"text":"Hello, is this available?"}'

# Get messages
curl http://localhost:5000/api/conversations/1/messages -H "Authorization: Bearer <token>"
```

## Commit
```bash
git add server/src/routes/conversations.js
git commit -m "feat(server): add conversations and messaging routes"
```

## Report
`C:\Users\HP\Desktop\Kaarya mobile app\Kaarya\.superpowers\sdd\2026-09-03-kaarya-stage-2-backend\task-5-report.md`
