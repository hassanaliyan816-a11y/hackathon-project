# Architecture

One Node.js process (22+), zero dependencies, one JSON data file. The browser talks to it over a small JSON API.

```
browser (public/)  --JSON-->  src/http  -->  src/domain  -->  src/storage (JSON file)
                                  |              |
                                  |              +--> src/triage --> src/ai (Gemini / Groq / OpenRouter)
                                  +--> src/export (Word report)
```

| Layer | Folder | Job |
|---|---|---|
| Entry and settings | `src/server.js`, `src/config.js` | start the server; read environment / `.env` |
| HTTP | `src/http/` | routes, security headers, rate limit, JSON body rules, static files, error handling. No business rules. |
| Domain | `src/domain/` | all rules: `issues` (reports, grouping, staff actions), `voting` (verification, reopen/close/auto-close), `trust` (ledger, weights), `crowd` (crowd priority, brigading), `views` (what each role may see), `users`, `admin` (summary, export data), `campus` (places, problem types, routing table), `core` (data handle, errors). `index.js` is the only door into this layer. |
| Triage | `src/triage/` | turn text into a decision: `rules` (danger keywords, places, injection stripping) + AI extraction, merged by `triage.js`. |
| AI | `src/ai/llm.js` | provider-neutral chat calls with a fallback chain, cooldowns and a per-minute budget. |
| Export | `src/export/` | `docx.js` writes a Word file without libraries; `report.js` builds the issue report (AI wording, code numbers). |
| Storage | `src/storage/store.js` | load/save the JSON file, seed users, reset. |
| UI | `public/` | `index.html` + `css/styles.css` + `js/` (core, nav, cards, pages, feel, main). |

## Rules of the design
- **The AI never decides.** It extracts facts and drafts wording. Department, priority, grouping, trust, votes, permissions and every number come from code (`src/domain`, `src/triage/rules.js`).
- **Privacy is enforced in one place**: `src/domain/views.js` builds every response about an issue, so confidential cases cannot leak through a forgotten endpoint.
- **The HTTP layer is thin**: it validates the request, finds the acting user, calls the domain, and formats the reply.
- **Safe by default**: localhost only, JSON-only POSTs, security headers, request limits (see SECURITY.md).

Ownership for contributors: one concern per file; add a rule in `domain/`, a keyword in `triage/rules.js`, a route in `http/app.js`.
