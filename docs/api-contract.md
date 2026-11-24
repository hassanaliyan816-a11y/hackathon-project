# API
Header `x-user-id` selects the acting user (no passwords, by design). All POSTs must send `Content-Type: application/json` (otherwise `415`).
Errors are `{ "error": "message" }` with status 400 bad input, 401 no user, 403 not allowed, 404 not found, 405 wrong method, 409 wrong state, 413 too large, 415 wrong content type, 429 too many requests.

| Method and path | Who | Purpose |
|---|---|---|
| GET `/api/health` | anyone | server and AI status |
| GET `/api/meta` | anyone | campus places and departments |
| GET `/api/users` | anyone | list users (id, name, role, dept, trust) |
| POST `/api/users` `{name}` | anyone | create a student (capped) |
| POST `/api/reset` | anyone | restore the starting data (judge access) |
| GET `/api/me` | any user | the acting user |
| POST `/api/reports` `{text}` | student | submit a report. `outcome`: created, joined, clarify, duplicate, already_joined, dispute_via_report |
| GET `/api/issues?scope=` | see below | `mine`, `public` (anyone), `dept` (staff, admin), `all`, `confidential` (admin) |
| POST `/api/issues/:id/join` | student | "me too" |
| POST `/api/issues/:id/vote` `{vote: confirm or dispute}` | affected student | verify a fix |
| POST `/api/issues/:id/status` `{status, note}` | staff (own dept), admin | `in_progress`, `resolved`, `invalid`, `closed` (admin) |
| POST `/api/issues/:id/reassign` `{dept}` | admin | move to another department |
| GET `/api/users/:id/trust` | the student, staff, admin | trust ledger with reasons |
| GET `/api/trending` | any user | most "me too" joins in the last hour |
| POST `/api/admin/summary` | admin | AI (or plain) briefing |
| POST `/api/export` `{ids?}` | admin | Word (.docx) report for the given issues, or all active ones |
