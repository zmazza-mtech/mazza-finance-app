# Context Session: Infrastructure Setup
Created: 2026-02-20
Status: in_progress
Project: /Users/zac-momoski-tech/code/mazza-finance
Context File: /Users/zac-momoski-tech/code/mazza-finance/.claude/tasks/context_session_infra-setup.md

## Task Type
Infrastructure — Docker Compose, Dockerfiles, Caddy, .env.example, README

## Goals
Create all infrastructure files for the Mazza Finance app. The backend and
frontend directories already exist but are empty. Do NOT touch them — they
are owned by the backend and frontend agents respectively.

## Files to Create

All paths relative to `/Users/zac-momoski-tech/code/mazza-finance/`:

### `docker-compose.yml`
Four services: caddy, backend, frontend, postgres.

Key requirements:
- `postgres` service: NO `ports:` key — internal network only. Use `expose: ["5432"]`.
- `backend` service: `user: "1001:1001"`, `cap_drop: [ALL]`, `mem_limit: 512m`,
  `cpus: 0.5`, `read_only: true`, `tmpfs: [/tmp]`, `restart: unless-stopped`
- `caddy` service: expose ports 80 and 443
- `frontend` service: static files served by Caddy (build output copied into Caddy
  container, or served from a minimal static container)
- Named volume `postgres_data` for Postgres data directory
- Teller certs bind-mounted into backend from host path specified in `.env`
  (`TELLER_CERT_PATH` and `TELLER_KEY_PATH`)
- Docker log rotation on all services: `json-file` driver, `max-size: 10m`, `max-file: "3"`
- Use `restart: unless-stopped` on all services
- Pin all image versions (e.g., `postgres:16-alpine`, `caddy:2-alpine`,
  `node:20-alpine`)

### `backend/Dockerfile`
- Base: `node:20-alpine`
- Multi-stage: `builder` stage installs deps and compiles TypeScript;
  `runner` stage copies compiled output only
- Create non-root user: `addgroup -g 1001 node && adduser -u 1001 -G node -D node`
- `USER node` before `CMD`
- `WORKDIR /app`
- Copy `package.json` and install production deps only in runner stage
- `CMD ["node", "dist/index.js"]`
- Do NOT copy `.env` or any secret files into the image

### `frontend/Dockerfile`
- Multi-stage: `builder` stage runs `npm run build`; final stage is `caddy:2-alpine`
  with static files copied to `/usr/share/caddy`
- Or: builder only, with Caddy serving the output via bind-mount in docker-compose.yml
- Keep it simple — the frontend is a static build

### `Caddyfile`
Key requirements:
- HTTP (`:80`) redirects to HTTPS (`:443`)
- HTTPS serves the app with:
  - HTTP Basic Auth on all routes (credentials from environment variable or hashed file)
  - `tls` block specifying TLS 1.2 minimum: `protocols tls1.2 tls1.3`
  - Reverse proxy `/api/*` → `backend:3001`
  - Static files for all other routes from frontend build output
  - Content-Security-Policy header: `default-src 'self'; script-src 'self'; object-src 'none'`
  - Additional security headers: `X-Frame-Options DENY`, `X-Content-Type-Options nosniff`,
    `Referrer-Policy strict-origin-when-cross-origin`
- Note: For local home network use with mkcert, the `tls` block may reference the cert
  and key file. Add a comment in the Caddyfile showing both mkcert and Let's Encrypt options.

### `.env.example`
All required environment variables with comments and generation instructions:

```
# Database
DATABASE_URL=postgresql://mazza_app:<password>@postgres:5432/mazza_finance
POSTGRES_PASSWORD=<strong password>

# teller.io
TELLER_CERT_PATH=/certs/teller_public_certificate.pem
TELLER_KEY_PATH=/certs/teller_private_key.pem
TELLER_ENVIRONMENT=sandbox

# Encryption (generate with: openssl rand -hex 32)
ENCRYPTION_KEY=<32-byte hex>

# App
PORT=3001
NODE_ENV=production

# Caddy Basic Auth (generate hash with: caddy hash-password --plaintext <password>)
CADDY_BASIC_AUTH_HASH=<bcrypt hash>
CADDY_DOMAIN=localhost
```

### `postgres-init/01-init.sql`
Initialization SQL run by Postgres on first start:
```sql
-- Create least-privilege application user
CREATE USER mazza_app WITH PASSWORD :'POSTGRES_APP_PASSWORD';

-- Create database
CREATE DATABASE mazza_finance OWNER mazza_app;

-- Connect and grant
\c mazza_finance
GRANT CONNECT ON DATABASE mazza_finance TO mazza_app;
GRANT USAGE ON SCHEMA public TO mazza_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO mazza_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO mazza_app;
```

### `.dockerignore`
Exclude: `node_modules/`, `dist/`, `.env`, `.env.*`, `!.env.example`,
`*.pem`, `*.key`, `.git/`, `teller-certificates/`

### `README.md`
Setup guide including:
1. Prerequisites (Docker, Docker Compose, mkcert)
2. Certificate placement (actual paths: `~/.ssh/teller_private_key.pem` and
   `~/.ssh/teller_public_certificate.pem`; confirm they are `chmod 600` / `chmod 644`)
3. Generate ENCRYPTION_KEY: `openssl rand -hex 32`
4. Caddy Basic Auth setup: `caddy hash-password --plaintext <yourpassword>`
5. Copy `.env.example` to `.env` and fill in values
6. HTTPS certificate strategy: mkcert for local network (with install instructions),
   note about Let's Encrypt alternative
7. `docker compose up --build` to start
8. One-time teller.io Connect flow

## Key Constraints

- DO NOT create `backend/` or `frontend/` source files — those are owned by other agents
- The `teller-certificates/` directory must NOT exist in the project — certs live at
  `~/.ssh/teller_private_key.pem` and `~/.ssh/teller_public_certificate.pem` on this host
- Postgres port 5432 must NEVER be in `ports:` — use `expose:` only
- All images must use pinned Alpine-based versions

## Agent Activity Log
<!-- Subagents MUST append their entries below this line -->

### Template for Subagent Entries:
**Agent**: <agent-type>
**Started**: <YYYY-MM-DD HH:MM>
**Completed**: <YYYY-MM-DD HH:MM>
**Status**: <success|blocked|error>
**Task**: <what the agent was asked to do>
**Findings**: <key findings>
**Actions Taken**: <what was done>
**Blockers/Issues**: <any problems encountered>
**Files Modified**: <list of files changed>

---
