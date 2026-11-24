# ReportFix (CodeQuest 2026 - AI module)

Students report campus problems (English / Roman Urdu / mixed). AI extracts the facts, plain code does the
routing, grouping, priority, trust and permissions. Departments act; affected students confirm or dispute fixes.

## Run (needs Node 22+, no npm install)
```
copy .env.example .env      # then put your OpenRouter key in .env (optional: without it the app uses keyword rules only)
npm start                   # http://localhost:3000
npm test                    # attack tests (AI on if key present; REPORTFIX_NO_LLM=1 for rules only)
```

## For judges (top bar of the app)
- **Acting as** dropdown: switch to any student, department staff or admin in one click, no passwords.
- **+ Create student**: instant new account (trust starts at 50).
- **Reset all data**: back to the starting seed.

## How the work is split (AI vs code)
| AI (OpenRouter, text understanding only) | Plain code (deterministic) |
|---|---|
| language, problem type, place named, safety danger, harassment, "is this an instruction to the system", one-line reason | safety floor keywords (EN + Roman Urdu), place validation against the campus list, department routing table, priority tiers, grouping key (place + type), trust ledger, weighted votes, crowd rules, confidentiality, role permissions |

If the AI is down, keyword rules still route, flag safety and protect confidential cases.

## Rules implemented
1. Route from text: department, place, priority, reason.
2. Group by meaning: same place + same problem type = one issue with a "me too" count; different problems at one place stay separate.
3. Impact over tone: safety (fire, sparks, gas, medical, structural) is always critical; SHOUTING / "urgent" are ignored.
4. Reports are data: instruction-like text is stripped, ignored and costs trust.
5. Harassment/ragging: confidential, admin-only, reporter hidden, never sent to the AI provider when keywords catch it.
6. Unknown or missing place: asks for clarification, nothing is routed.
7. Resolved is not the end: only students who reported/joined before the fix can confirm or dispute; weighted disputes reopen.
8. Trust score: starts at 50, every change is a ledger line with a reason ("Why this score?").
9. Crowd priority: needs several distinct credible students; one voice can never lift an issue; the crowd can raise it by one tier but never to critical.
Bonus: trending board, AI admin summary (falls back to a plain summary), brand-new-account brigading detection.

## Honest limitations
- The campus list (Lab 1-6, CSE/EE/IS Lab and Block, Library, Cafeteria) is our assumption; the statement gives none.
- Department routing table is ours (wifi -> IS, electrical -> EE, everything else -> owner of the place); admin can reassign.
- Data is a local JSON file, single process, no real login (as the judge access requires).
- Keyword lists cover common English/Roman Urdu phrasing, not every phrasing; the AI covers typos and unusual wording.

## Branding (Military College of Signals)
The header shows `public/mcs-logo.png` (the MCS logo supplied by the team). If the file is missing, a generic "MCS" monogram is shown.
To use the official logo: copy the college's logo file to `public/mcs-logo.png` (PNG, square or transparent works best) and refresh.

## Verification window
After staff mark an issue resolved, affected students have 30 minutes (change with the environment variable `REPORTFIX_VERIFY_MIN`, e.g. `2` for a short demo) to dispute it. A reopen needs at least one credible disputer (trust >= 30). If nobody credibly disputes, the issue closes automatically.

## Word export (admin)
Admin > All issues: **Export Word (.docx)** on any issue card (confidential cases too, reporter identity withheld) or **Export all active issues**.
The AI drafts the wording (subject, description of the issue, impact, recommended action) from system data; every count (students who reported/joined, credible supporters, verification confirm/dispute votes) is computed by code, not the AI. If the AI is unavailable a template text is used. Only the admin can export (students and staff get 403).

## AI model (OpenRouter, free models)
`LLM_MODELS` in `.env` is a comma-separated list tried in order; if one is rate-limited the next is used, and if all fail the app uses keyword rules. Free OpenRouter models are limited to about 50 requests per day until the account has 10 credits (then 1000 per day). Put a paid model first (e.g. `google/gemini-2.5-flash`) when you have credit. Tests run rules-only by default; `TEST_WITH_AI=1 node test/attack.js` uses the AI.
