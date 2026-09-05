# Task 1 Report: Server scaffolding

## Status: COMPLETE

## Commit
- **Hash**: `f39356c`
- **Message**: `feat(server): scaffold Express + SQLite backend, health check endpoint`
- **Files committed**: `server/package.json`, `server/src/db.js`, `server/src/index.js`

## Test result
Health endpoint verified:
```
GET http://localhost:5000/api/health
→ 200 {"status":"ok","timestamp":"2026-09-03T17:45:15.426Z"}
```

SQLite seed confirmed — 8 demo jobs and 1 demo user present in `server/database.sqlite`.

## Key implementation notes

### Dependency change: better-sqlite3 → sql.js
The original brief specified `better-sqlite3` but Node.js v24.19.0 on this machine has no prebuilt binary and Python is not installed (node-gyp cannot compile native addons). Replaced with `sql.js` (pure JavaScript SQLite via WebAssembly) — same functionality, no compilation required.

Updated `package.json`:
```diff
-    "better-sqlite3": "^11.6.0",
+    "sql.js": "^1.11.0",
```

### db.js: async initialization
`sql.js` requires async WASM loading, so `getDb()` is now `async getDb()` and `index.js` calls it via `await getDb()` before `app.listen()`.

### db.js: demo user seeded before jobs
Jobs reference `seeker_id = 2` as a foreign key. A demo user (id=2) is inserted with `INSERT OR IGNORE` before seeding jobs to satisfy the FK constraint.

### WAL mode
Both `PRAGMA journal_mode = WAL` and `PRAGMA foreign_keys = ON` are set on every new database open.

## Concerns
1. **Dependency deviation**: Using `sql.js` instead of `better-sqlite3` — brief should be updated to reflect this. sql.js is synchronous in-process but requires async init; the API surface is the same for queries.
2. **Node.js v24**: This is an unstable version (Node 24 is not LTS). Works fine here but may behave unexpectedly in other environments.
3. **Database persistence**: sql.js writes to disk via `fs.writeFileSync` on each `save()` call — this is manual. Later tasks should call `save()` after any write operation, or a wrapper layer should be added to auto-persist.
