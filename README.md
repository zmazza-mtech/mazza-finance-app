# Mazza Finance

Personal cash flow forecasting app for the Mazza household. Connects to bank
accounts via teller.io and displays a day-by-day calendar of actual and
forecasted transactions with a running balance.

---

## Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (or Docker Engine + Compose v2)
- [mkcert](https://github.com/FiloSottile/mkcert) — for trusted local HTTPS
- [Caddy](https://caddyserver.com/docs/install) — for generating the Basic Auth hash (or use Docker)

---

## First-Time Setup

Follow these steps in order.

### 1. Verify teller.io certificates are in place

The teller.io client certificates must be stored **outside** the project
directory and have correct permissions:

```bash
ls -la ~/.ssh/teller_public_certificate.pem ~/.ssh/teller_private_key.pem
```

Expected output:
```
-rw-r--r--  ...  teller_public_certificate.pem   (644)
-rw-------  ...  teller_private_key.pem           (600)
```

If permissions are wrong, fix them:
```bash
chmod 600 ~/.ssh/teller_private_key.pem
chmod 644 ~/.ssh/teller_public_certificate.pem
```

### 2. Copy the environment file

```bash
cp .env.example .env
```

### 3. Generate the encryption key

```bash
openssl rand -hex 32
```

Paste the output into `.env` as the value for `ENCRYPTION_KEY`.

### 4. Set strong database passwords

Edit `.env` and set unique values for:
- `POSTGRES_PASSWORD` — Postgres superuser (init only)
- `POSTGRES_APP_PASSWORD` — application runtime user
- Update `DATABASE_URL` to match `POSTGRES_APP_PASSWORD`

### 5. Set up HTTPS with mkcert

```bash
# Install mkcert and the local CA
brew install mkcert
mkcert -install

# Generate certificates for localhost
mkcert localhost 127.0.0.1 ::1
```

This creates `localhost+2.pem` and `localhost+2-key.pem`. Update `Caddyfile`
to use these:

```caddyfile
# Replace: tls internal
# With:
tls /path/to/localhost+2.pem /path/to/localhost+2-key.pem
```

**For other household devices (e.g., Mrs. Mazza's phone):**

```bash
# On the server machine, find the mkcert root CA:
mkcert -CAROOT

# Copy rootCA.pem to the device and install it:
# - iPhone: Email the file → open → Settings → Profile → Install
# - Android: Settings → Security → Install certificate
```

### 6. Generate the Caddy Basic Auth password hash

```bash
# If Caddy is installed locally:
caddy hash-password --plaintext <yourpassword>

# Or use Docker:
docker run --rm caddy:2-alpine caddy hash-password --plaintext <yourpassword>
```

Paste the resulting `$2a$...` hash into `.env` as `CADDY_BASIC_AUTH_HASH`.
Keep the plaintext password somewhere safe — you'll need it to log in from
every browser and device.

### 7. Start the application

```bash
docker compose up --build
```

First start takes a few minutes while Docker builds the images. Subsequent
starts are much faster.

### 8. Connect your bank account (one-time)

1. Open `https://localhost` in your browser
2. Enter the Basic Auth credentials when prompted
3. Follow the on-screen bank connection flow (teller.io Teller Connect)
4. After connection, the first sync runs automatically

---

## Daily Usage

- **URL**: `https://localhost` (or your configured `CADDY_DOMAIN`)
- **Sync**: Runs automatically every hour. Use "Sync Now" in the header for
  an immediate refresh.
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

**Container won't start — permission error on certs:**
```bash
chmod 600 ~/.ssh/teller_private_key.pem
chmod 644 ~/.ssh/teller_public_certificate.pem
```

---

## Security Notes

- **HTTP Basic Auth** protects all routes at the Caddy layer. Keep the
  password out of browser autofill on shared devices.
- **`.env` file** contains secrets — it is blocked by `.gitignore` and must
  never be committed.
- **teller.io certificates** live at `~/.ssh/` outside the project directory.
  Never copy them into the project folder.
- **Postgres** is not exposed outside the Docker network — no ports are
  mapped to the host.
- If this app is ever exposed to the public internet, a full
  application-layer authentication system must be added first.

---

## Project Structure

See [`CLAUDE.md`](CLAUDE.md) for full developer documentation.
