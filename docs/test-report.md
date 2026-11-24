# Test report
Run everything: `npm test` (rules-only, no API key needed). **122 checks, all PASS.**

| Suite | Checks | What it covers |
|---|---|---|
| `test/attack.js` | 38 | routing, Roman Urdu/English grouping, different problems at one place, calm fire/sparks critical, SHOUTING ignored, prompt injection, confidential ragging reports, unknown places, only-affected voting, crowd cannot be gamed, brigading, permissions, reset |
| `test/community.js` | 11 | confirm closes + trust ledger, late joiners cannot vote, a lone low-trust voice cannot reopen, credible dispute reopens, auto-close after the verification window, fake report costs trust |
| `test/export.js` | 5 | admin Word export works, student/staff get 403, confidential export, export all |
| `test/security.js` | 68 | security headers, path traversal, server crash resistance, CSRF, body limits, prototype pollution, authorization matrix, confidentiality across every endpoint and role, input validation, abuse limits, regex DoS, export hardening, information exposure |

Also done by hand / in a browser:
- XSS probe: five script payloads viewed as admin, staff and student on every page: none executed (see docs/SECURITY.md).
- UI click-through: sign in via the nav menus, report, group, resolve, dispute/reopen, reset, Word download.
- AI run: `TEST_WITH_AI=1 node test/attack.js` and `EXPORT_WITH_AI=1 node test/export.js` with Gemini: all pass, report text AI-written.

Not tested: other browsers, many simultaneous real users, a real phone's vibration, opening the .docx in Microsoft Word itself (validated with a Word-file reader).
