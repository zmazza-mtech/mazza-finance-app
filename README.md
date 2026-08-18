# Mazza Finance

Personal cash flow forecasting app for the Mazza household. Connects to bank
accounts via SimpleFIN and displays a day-by-day calendar of actual and
forecasted transactions with a running balance.

---

## The Cloudflare Worker (in progress)

The app is being replatformed onto a single Cloudflare Worker that serves both
the Vite build and the Hono API from one origin — which is what removes CORS,
the split-origin CSP, Caddy, Compose and Postgres. See
[`docs/superpowers/specs/2026-08-17-cloudflare-native-replatform.md`](docs/superpowers/specs/2026-08-17-cloudflare-native-replatform.md)
and the tracking epic, issue #63.

Until the Phase 2 cutover, **both stacks exist**. The Docker Compose stack
below is still the one running the household's money. The Worker is where new
work lands.

### Local loop

```bash
# 1. Build the SPA. wrangler serves ../frontend/dist as static assets.
cd frontend && npm run build

# 2. Serve the SPA and the API together, on one origin.
cd ../worker && npx wrangler dev
```

`wrangler dev` provisions D1 locally through Miniflare, so nothing needs
Docker and nothing needs a database password. Apply the migrations to the
local database once:

```bash
cd worker && npx wrangler d1 migrations apply mazza-finance --local
```

`frontend/.env.production` sets `VITE_API_BASE_URL=/api/v1`, a relative path,
which is what makes the SPA call its own origin. The Compose build passes the
variable as a build arg and an actual environment variable wins over the
file, so the old stack is unaffected.

Routing is decided in `worker/wrangler.toml`: `run_worker_first = ["/api/*"]`
sends every API request to the Worker before the asset server sees it, and
`not_found_handling = "single-page-application"` returns the SPA shell for a
client-side route. An unknown `/api/*` path returns the `{ data, error }` 404
envelope rather than the shell — asserted in `worker/tests/security-headers.spec.ts`.

The security headers the Caddyfile enforces are set by the Worker itself
(`worker/src/lib/security-headers.ts`), verbatim, so retiring Caddy does not
quietly drop the CSP.

### Worker tests

```bash
cd worker && npm test
```

Runs in `workerd` against real D1 bindings via
`@cloudflare/vitest-pool-workers`, applying the real migration chain first —
no mocks, and no hand-built test schema that could let a broken migration
pass.

---

## Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (or Docker Engine + Compose v2)
- [mkcert](https://github.com/FiloSottile/mkcert) — for trusted local HTTPS
- [Caddy](https://caddyserver.com/docs/install) — for generating the Basic Auth hash (or use Docker)
- A [SimpleFIN Bridge](https://beta-bridge.simplefin.org/) account ($1.50/month) with bank accounts connected

---

## First-Time Setup

Follow these steps in order.

### 1. Copy the environment file

```bash
cp .env.example .env
```

### 2. Set strong database passwords

Edit `.env` and set unique values for:
- `POSTGRES_PASSWORD` — Postgres superuser (init only)
- `POSTGRES_APP_PASSWORD` — application runtime user
- Update `DATABASE_URL` to match `POSTGRES_APP_PASSWORD`

### 3. Configure SimpleFIN

Place your SimpleFIN Access URL in the secrets file:

```bash
mkdir -p secrets
echo "YOUR_ACCESS_URL_HERE" > secrets/simplefin_access_url.txt
chmod 600 secrets/simplefin_access_url.txt
```

The Access URL looks like `https://user:pass@beta-bridge.simplefin.org/simplefin`.
Get it from the SimpleFIN Bridge setup page after connecting your bank accounts.

**Rate limit**: SimpleFIN allows 24 API calls per day. Exceeding this limit
permanently disables your token. The app enforces this limit server-side.

### 4. Set up HTTPS with mkcert

```bash
# Install mkcert and the local CA
brew install mkcert
mkcert -install

# Generate certificates for localhost
mkcert localhost 127.0.0.1 ::1
```

This creates `localhost+2.pem` and `localhost+2-key.pem` in the project root,
which are mounted into Caddy via `docker-compose.yml`.

**For other household devices (e.g., Mrs. Mazza's phone):**

```bash
# On the server machine, find the mkcert root CA:
mkcert -CAROOT

# Copy rootCA.pem to the device and install it:
# - iPhone: Email the file → open → Settings → Profile → Install
# - Android: Settings → Security → Install certificate
```

### 5. Generate the Caddy Basic Auth password hash

```bash
# If Caddy is installed locally:
caddy hash-password --plaintext <yourpassword>

# Or use Docker:
docker run --rm caddy:2-alpine caddy hash-password --plaintext <yourpassword>
```

Paste the resulting `$2a$...` hash into `.env` as `CADDY_BASIC_AUTH_HASH`.
Keep the plaintext password somewhere safe — you'll need it to log in from
every browser and device.

### 6. Start the application

```bash
docker compose up --build
```

First start takes a few minutes while Docker builds the images. Subsequent
starts are much faster.

### 7. First sync

1. Open `https://localhost` in your browser
2. Enter the Basic Auth credentials when prompted
3. The app auto-syncs on first page load — your accounts and transactions
   will appear within a few seconds

---

## Daily Usage

- **URL**: `https://localhost` (or your configured `CADDY_DOMAIN`)
- **Sync**: Auto-syncs on the first page load each day. Use "Sync Now" in the
  header for additional refreshes. The header shows remaining syncs (X/24).
- **Add future transaction**: Click "+" on any future day cell
- **Manage recurring transactions**: Navigate to `/recurring`

---

## Updating the App

```bash
git pull
docker compose up --build
```

Database migrations run automatically on container startup.

---

## Running the Tests

None of the suites touch the application stack. Each brings up its own
throwaway Postgres on its own port under its own Compose project name, so they
can run while `docker compose up` is running — or while it is not — and the
production `postgres_data` volume is never opened either way.

**Backend — unit and integration:**
```bash
cd backend && npm test
```
Starts the database in `docker-compose.test.yml` on first run and migrates it.
Locally the container is left running so the next run starts in about a second;
stop it with `npm run test:db:down`. Point `TEST_DATABASE_URL` at an existing
instance to skip Docker entirely.

**Frontend — unit:**
```bash
cd frontend && npm test
```

**End-to-end (Playwright):**
```bash
cd frontend && npm run e2e
```
Needs Docker running, and nothing else. The suite builds the frontend, brings up
`docker-compose.e2e.yml` — Postgres on tmpfs, the backend image, Caddy serving
the production build behind the production CSP — runs against it, and tears it
down with its volumes. It starts from an empty database every time, so two runs
in a row give the same answer.

To iterate on a spec without paying for the build and container start each time,
run the stack yourself and tell the suite to leave it alone:
```bash
docker compose -f docker-compose.e2e.yml up --build   # in one terminal
cd frontend && E2E_SKIP_STACK=1 npm run e2e           # in another
```
Note that the seeded data then accumulates across runs. Take it down with
`npm run e2e:down`.

---

## Troubleshooting

**View logs:**
```bash
docker compose logs -f backend    # API and sync logs
docker compose logs -f caddy      # Proxy and TLS logs
docker compose logs -f postgres   # Database logs
```

**Restart a single service:**
```bash
docker compose restart backend
```

**Full reset (WARNING: destroys all data):**
```bash
docker compose down -v
docker compose up --build
```

---

## Security Notes

- **HTTP Basic Auth** protects all routes at the Caddy layer. Keep the
  password out of browser autofill on shared devices.
- **`.env` file** contains secrets — it is blocked by `.gitignore` and must
  never be committed.
- **SimpleFIN Access URL** is stored as a Docker Compose secret, mounted at
  `/run/secrets/simplefin_access_url`. It is not visible via `docker inspect`.
- **Postgres** is not exposed outside the Docker network — no ports are
  mapped to the host.
- If this app is ever exposed to the public internet, a full
  application-layer authentication system must be added first.

---

## Project Structure

See [`CLAUDE.md`](CLAUDE.md) for full developer documentation.
