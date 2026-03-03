# Mazza Finance

Personal cash flow forecasting app for the Mazza household. Connects to bank
accounts via SimpleFIN and displays a day-by-day calendar of actual and
forecasted transactions with a running balance.

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
