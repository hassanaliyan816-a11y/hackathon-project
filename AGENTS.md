# AGENTS.md — rules for every AI agent in this repo

## Goal
Deliver a WORKING, DEMONSTRABLE MVP that meets the official judging rules. Simple English. Small changes.

## Source of truth
docs/requirements.md, docs/architecture.md, docs/api-contract.md, docs/tasks.md

## Rules
- Never invent completed features, test results, tool calls or Git changes.
- Only edit files you own for your task (see docs/tasks.md). Do not edit the same file as another agent.
- Do not change the API contract without Captain approval.
- Never commit secrets. Use .env (ignored) and .env.example.
- Ask before: spending API money, deploying publicly, deleting data, adding dependencies/databases.
- Prefer a running app over extra features.

## Commands (fill in after stack is chosen)
- Install: none (Node 22+, zero dependencies)
- Run: node src/server.js  (http://localhost:3000)
- Test: npm test  (REPORTFIX_NO_LLM=1 npm test for rules only)

## Definition of done
Feature can be demonstrated, build/tests run with real output reported, docs/tasks.md updated.

## Handoff format (end of every task)
TASK ID / STATUS (DONE|PARTIAL|BLOCKED) / FILES CHANGED / DECISIONS / COMMANDS OR TESTS RUN /
RESULTS-EVIDENCE / WHAT IS NOT TESTED / RISK OR BLOCKER / NEXT AGENT + EXACT NEXT TASK
