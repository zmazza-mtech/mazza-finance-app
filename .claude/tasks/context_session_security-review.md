# Context Session: Security Review
Created: 2026-02-20 00:00
Status: in_progress
Project: /Users/zac-momoski-tech/code/mazza-finance
Context File: /Users/zac-momoski-tech/code/mazza-finance/.claude/tasks/context_session_security-review.md

## Task Type
Security Review — Pre-Development PRD Review

## Goals
Review the Mazza Finance PRD (`docs/PRD.md`) for security vulnerabilities,
risks, and gaps BEFORE development begins. The goal is to identify all
critical, high, and medium security issues so they can be resolved in the
PRD before code is written. Low items should also be flagged.

## Files in Scope
- `/Users/zac-momoski-tech/code/mazza-finance/docs/PRD.md` — Full PRD

## Key Context for Reviewer

This is a personal finance web application with the following security-relevant characteristics:

1. **No authentication layer** — The PRD explicitly states no login/auth. The
   app assumes network-level access control (home network / VPN only). This is
   a deliberate design decision for a personal, household-only app.

2. **teller.io API integration** — Uses mutual TLS certificate auth.
   Access tokens are stored encrypted (AES-256) in Postgres. All teller.io
   calls are server-side only (never from browser).

3. **Self-hosted via Docker Compose** — Postgres is internal-only (not exposed
   outside Docker network). Caddy handles TLS termination.

4. **Financial data** — All amounts stored as NUMERIC(12,2) in Postgres,
   transmitted as decimal strings in JSON (never floating point).

5. **Personal household use only** — Mr. and Mrs. Mazza only. No public-facing
   multi-user concerns.

6. **No session management** — No cookies, no JWT, no sessions (no auth layer).

## Areas to Focus On

- teller.io credential storage and encryption design
- Docker network isolation adequacy
- No-auth design: is network-level access control sufficient? What are the risks?
- Input validation on API endpoints
- Financial data precision and integrity
- Secret management (env vars, certs)
- XSS risks in the React frontend (financial data display)
- SQL injection (Drizzle ORM usage)
- CSRF (no auth = no CSRF session to hijack, but worth noting)
- Container security (image hardening, non-root users, etc.)
- Caddy TLS configuration
- Logging of sensitive data
- The client certificate bind-mount approach for teller.io
- Any OWASP Top 10 concerns applicable to this architecture

## Agent Activity Log
<!-- Subagents MUST append their entries below this line -->

### Template for Subagent Entries:
**Agent**: <agent-type>
**Started**: <YYYY-MM-DD HH:MM>
**Completed**: <YYYY-MM-DD HH:MM>
**Status**: <success|blocked|error>

**Task**: <what the agent was asked to do>

**Findings**:
- <key findings>

**Actions Taken**:
- <what was done>

**Blockers/Issues**:
- <any problems encountered>

**Files Modified**:
- <list of files changed>

---
