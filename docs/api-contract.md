# API (header `x-user-id` selects the acting user; no passwords)
GET /api/users | POST /api/users {name} | POST /api/reset | GET /api/me | GET /api/meta | GET /api/health
POST /api/reports {text} -> outcome: created | joined | clarify | duplicate | already_joined | dispute_via_report
GET /api/issues?scope=mine|public|dept|all|confidential
POST /api/issues/:id/join | /vote {vote: confirm|dispute} | /status {status: in_progress|resolved|invalid|closed, note} | /reassign {dept}
GET /api/users/:id/trust | GET /api/trending | POST /api/admin/summary
