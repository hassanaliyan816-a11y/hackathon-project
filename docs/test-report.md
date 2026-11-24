# Test report
Automated: `node test/attack.js` = 38 PASS / 0 FAIL with AI on; `REPORTFIX_NO_LLM=1 node test/attack.js` = 38 PASS / 0 FAIL (rules only).
Includes: grouping across Roman Urdu/English, different problems at one place kept separate (window vs smell), calm fire/sparks critical, SHOUTING ignored,
injection ignored + trust penalty, confidential ragging hidden from public/all departments/reporter, Lab 9 / no place -> clarification,
only affected students vote, disputes reopen, trust ledger reasons, one high-trust voice cannot lift a minor issue, brigading capped + flagged, permissions, reset.

Manual click-through in the browser UI (rules-only mode, AI credit was exhausted): Ali report -> Sara report grouped ("me too", 2 students) ->
IS staff resolved with a note -> Ali "Still broken" (1 of 2) -> Sara "Still broken" -> issue reopened, Sara trust 85 -> 88 with ledger reason -> two-click Reset worked.

NOT TESTED: other browsers, many simultaneous users, admin tabs by hand (Confidential, Users & trust, Trending, Summary are API-tested only),
AI behaviour on sentences we have not seen (OpenRouter credit ran out during testing; the app falls back to keyword rules).

Update: community layer hardened and tested (`node test/community.js`, 11 checks PASS):
- A reopen now needs at least one credible disputer (trust >= 30); a lone very-low-trust voice cannot reopen a fix.
- A resolved issue closes automatically if nobody credibly disputes within the verification window (default 30 min, set REPORTFIX_VERIFY_MIN to change).
Run everything with `npm test` (or `node test/attack.js` and `node test/community.js`).
