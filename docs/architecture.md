# Architecture
Node 22+ (zero dependencies): `src/server.js` (HTTP + static), `src/triage.js` (AI + rules), `src/rules.js` (keywords, location, injection),
`src/llm.js` (OpenRouter), `src/logic.js` (issues, trust, votes, views), `src/store.js` (JSON file), `src/campus.js` (places, types, routing table).
UI: `public/index.html` (plain JS). API key stays on the server (.env). Data: `data/db.json` (ignored by git).
Ownership: AI extracts facts only; code decides priority, department, trust, permissions.
