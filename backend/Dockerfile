# ---------------------------------------------------------------------------
# Stage 1: Build
# ---------------------------------------------------------------------------
FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies first (layer cache)
COPY package*.json ./
RUN npm ci --ignore-scripts

# Copy source and compile
COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build
# Copy migration SQL files into dist so the runtime image has them
RUN cp -r src/db/migrations dist/db/

# ---------------------------------------------------------------------------
# Stage 2: Production runtime
# ---------------------------------------------------------------------------
FROM node:20-alpine AS runtime

# Non-root user (UID 1001)
RUN addgroup -S mazza && adduser -S -G mazza -u 1001 mazza

WORKDIR /app

# Install production dependencies only
COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

# Copy compiled output
COPY --from=builder /app/dist ./dist

# Docker Compose secrets are mounted at /run/secrets — ensure dir exists
RUN mkdir -p /run/secrets && chown mazza:mazza /run/secrets

USER mazza

EXPOSE 3001

CMD ["node", "dist/index.js"]
