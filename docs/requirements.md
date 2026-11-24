# Requirements - ReportFix (CodeQuest 2026)
Goal judges want: an app that behaves correctly on unseen sentences (40 pts live attack), with working core flow (20), community layer (20), clear AI-vs-code split (10), 2-minute pitch where everyone speaks (10).

## Must-have (all built, see README "Rules implemented")
Route text -> dept/place/priority/reason; group by meaning; impact over tone; reports are data; confidential harassment; no guessing places; resolve -> confirm/dispute; trust score with explanation; crowd priority; judge access (switch user, create student, reset).

## Out of scope
Real authentication, deployment, email/SMS, visual polish.

## Acceptance tests (automated in test/attack.js, 36 checks)
A1 Roman Urdu + English reports group into one issue. A2 calm fire/sparks are critical, SHOUTING is not. A3 injection ignored and penalised. A4 ragging report invisible to public/all departments, reporter hidden. A5 Lab 9 / no place -> clarification. A6 only affected students vote; disputes reopen; ledger explains trust. A7 one high-trust voice cannot lift a minor issue. A8 brand-new account pile-on is capped and flagged.
