# Task 5 Report: Conversations + Messages Routes

## Status: COMPLETE

## Commit
- Hash: `5793e47`
- Message: `feat(server): add conversations and messaging routes`
- Files: `server/src/routes/conversations.js`, `server/src/db.js`

## What was built

### `server/src/routes/conversations.js`
Four endpoints, all using async `getDb()` and `requireAuth` (synchronous):

| Endpoint | Description |
|---|---|
| `GET /api/conversations` | List user's conversations ordered by `updated_at DESC`. Each includes `id`, `jobId`, `jobTitle`, `participants`, `lastMessage`, `unreadCount`, `createdAt`, `updatedAt`. |
| `GET /api/conversations/:id` | Get a single conversation. Returns 404 if not found, 403 if user is not a participant. |
| `GET /api/conversations/:id/messages` | Get all messages (ordered by `created_at ASC`). Automatically marks unread messages from others as read (`is_read = 1`). |
| `POST /api/conversations/:id/messages` | Send a message. Returns 400 if `text` is missing/empty, 403 if not a participant, 404 if conversation not found. Message is auto-marked as read by sender. |

### Field mapping (per spec)
- DB `content` → API `text`
- DB `is_read` (0/1) → API `readAt` (null if 0, `created_at` timestamp if 1)
- DB `created_at` → API `createdAt`

### `server/src/db.js` additions
- `seedConversations()` function that runs on DB init (only if conversations table is empty)
- Seeds: conversation 1 (job 1, participants user 10 + 11, 2 messages), plus test users 10 and 11

## Test Results

All 20 tests passed:

| # | Test | Result |
|---|---|---|
| 1 | `GET /api/conversations` — empty list | PASS — `{"data":[]}` |
| 2 | `GET /api/conversations/1` — 404 not found | PASS — `{"error":"Conversation not found"}` |
| 3 | `POST .../messages` — 404 not found | PASS |
| 4 | `POST .../messages` — 400 missing text | PASS — `{"error":"Missing or invalid required field: text"}` |
| 5 | No auth — 401 unauthorized | PASS |
| 6 | `GET /api/conversations` — seeded data with `lastMessage` + `unreadCount` | PASS |
| 7 | `GET /api/conversations/1` — details with participants | PASS |
| 8 | `GET .../messages` — mark-as-read side effect | PASS — unread messages from other user marked `readAt` |
| 9 | `POST .../messages` — send message, auto-read by sender | PASS — `readAt` set to `createdAt` |
| 10 | `GET /api/conversations` — `lastMessage` updated after send | PASS — new message reflected |
| 11 | `GET .../messages` as second participant — read receipt propagation | PASS |
| 12 | `POST .../messages` as second participant | PASS |
| 13 | `GET /api/conversations` — `unreadCount` accurate per participant | PASS |
| 14 | `GET /api/conversations` — `unreadCount` = 0 for message sender | PASS |
| 15-16 | Multi-message send, unreadCount tracks correctly | PASS |
| 17 | `GET /api/conversations/:id` — 403 for non-participant | PASS |
| 18-20 | `GET/POST` for non-existent conversation — 404 | PASS |

## Notes
- The seeded test users (ids 10, 11) in `db.js` allow repeatable integration testing without needing registration during test runs.
- Database: `server/database.sqlite` (sql.js persisted to disk).
- Server runs on port 5000.
