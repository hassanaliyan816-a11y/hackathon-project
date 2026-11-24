# Security review of ReportFix

Method: (1) read all server code, (2) an automated attack script, `node test/security.js` (68 checks against a live server), (3) a browser probe for cross-site scripting (XSS).
Result after fixes: **68 / 68 checks pass; no XSS payload executed.**

## Findings and fixes

| # | Severity | Finding (found by the scan) | Fix |
|---|---|---|---|
| 1 | **High** | **One request crashed the whole server.** `GET //` made the URL parser throw outside the error handler, killing the process (remote, no login needed). Same family: any malformed URL, bad headers, or an error while serving a file. | Request targets are validated before parsing, every handler is wrapped so errors become a 4xx/5xx response, `clientError` is handled, request timeouts set, and a process-level guard logs instead of exiting. (`src/http/app.js`, `src/server.js`) |
| 2 | **Medium** | **Cross-site request forgery on the open endpoints.** Any website could make a judge's browser send a simple POST to `/api/reset` (wipe all data) or `/api/users`, because the server accepted any content type. | Every POST must be `application/json`; browsers cannot send that cross-site without permission, and there is no CORS. Others get `415`. (`requireJson` in `src/http/security.js`) |
| 3 | **Medium** | **No security headers**: no clickjacking protection, no CSP, no nosniff. | `Content-Security-Policy` (blocks framing, foreign scripts, plugins, `<base>` and form-post tricks), `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, COOP/CORP on every response. |
| 4 | **Medium** | **Unlimited accounts and unlimited requests**: anyone could create accounts until memory ran out, or flood the API. | Cap on created accounts (default 300), per-client rate limit (default 300 requests/min, `429`), 20 KB body limit. |
| 5 | **Medium** | **AI-cost abuse**: every new report triggers an AI request; creating fresh accounts bypassed the per-user report limit and could burn the free AI quota. | Global AI budget (default 40 requests/min); over budget, keyword rules answer instead. |
| 6 | **Low** | The server listened on every network interface by default. | Listens on `127.0.0.1` only; `HOST=0.0.0.0` is an explicit opt-in to let other devices connect. |
| 7 | **Low** | Static file server used a prefix check on the folder and decoded paths loosely. | Strict allow-list of path characters, no `..`/`%`/`\`/dot-files, resolved path must be inside `public/`, known file types only. |

## What was tested and held up
- **Path traversal** (`..`, `%2e%2e`, `%5c`, `....//`, `..;/`, `%00`, `/.env`, `/src/*`, `/data/*`): never leaks a file.
- **Authorization matrix** (19 role/endpoint combinations): students, staff and admin can only do what their role allows; unknown or prototype-like user ids (`__proto__`, `constructor`) get `401`.
- **Confidentiality**: a ragging report did not appear in any list, trending, join/vote attempt, "export all", or the admin summary for any of the 12 users, and the reporter's name never appears in the admin's confidential view.
- **Input handling**: bad JSON, non-string text, control and bidi characters, prototype-pollution payloads, huge IDs: no `500`s. Student names cannot carry HTML (`<`, `>` and quotes are stripped).
- **Regex / algorithmic DoS**: eleven adversarial 1000-character inputs all finish in under a second.
- **Cross-site scripting** (real browser): five payloads (`<img onerror>`, `<script>`, `<svg onload>`, an attribute break-out, `<iframe src=javascript:>`) submitted as reports and viewed as admin, staff and student on every page: none executed; all displayed as plain text because every user-controlled value passes through `esc()`.
- **Word export**: XML-special and control characters are escaped; the download filename is a fixed safe pattern; only the admin can export; "export all" never includes confidential cases.
- **Information exposure**: errors return a short message, no stack traces or paths; the public user list contains no internal fields.

## Known and accepted risks (by design, please do not report as bugs)
1. **No passwords.** The hackathon requires judges to switch users with one click, so the server trusts the `x-user-id` header. Anyone who can reach the server can act as any user. Mitigation: localhost-only by default. Production would need real authentication.
2. **`/api/reset` and `/api/users` are unauthenticated** (also a judge requirement). Protected from cross-site abuse (finding 2) but not from someone who can reach the server directly.
3. **CSP still allows inline scripts/styles** (`'unsafe-inline'`) because the page uses inline event handlers. XSS is prevented by escaping all user text instead (tested above). A hardening step would be to move the handlers into the script files.
4. **Data is a plain JSON file** (no encryption at rest) and the whole app is one process; fine for a demo, not for production.
5. **AI prompt injection** cannot change priority, trust, department or permissions (the AI only extracts facts; plain code decides), but a determined student can still influence the *wording* of the AI-written Word report from their own report text. Reports are shown as quoted data, and numbers in the report come from code.
6. **API keys** live only in `.env` (git-ignored) and are never sent to the browser. Rotate any key that was shared in chat or screenshots.

## Re-run it
```
node test/security.js     # the scan (rules-only, needs no API key)
npm test                  # all 122 checks
```
