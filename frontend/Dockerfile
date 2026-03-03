# ---------------------------------------------------------------------------
# Stage 1: Build
# ---------------------------------------------------------------------------
FROM node:20-alpine AS builder

WORKDIR /app

# Declare build-time env vars so Vite embeds them at build time
ARG VITE_API_BASE_URL
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL

# Install dependencies first (layer cache)
COPY package*.json ./
RUN npm ci --ignore-scripts

# Copy source and build
COPY . .
RUN npm run build

# Run the build at container start so docker compose up --build always
# writes fresh output into the frontend_build named volume. Without a CMD
# the builder stage exits immediately and the volume retains stale content.
CMD ["npm", "run", "build"]

# ---------------------------------------------------------------------------
# Stage 2: Static file server (nginx)
# ---------------------------------------------------------------------------
FROM nginx:1.27-alpine AS runtime

# Remove default nginx config
RUN rm /etc/nginx/conf.d/default.conf

# Caddy handles HTTPS and Basic Auth upstream — nginx just serves static files
COPY nginx.conf /etc/nginx/conf.d/app.conf

# Copy Vite build output
COPY --from=builder /app/dist /usr/share/nginx/html

# Non-root nginx
RUN chown -R nginx:nginx /usr/share/nginx/html && \
    chown -R nginx:nginx /var/cache/nginx && \
    chown -R nginx:nginx /var/log/nginx && \
    touch /var/run/nginx.pid && \
    chown nginx:nginx /var/run/nginx.pid

USER nginx

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
