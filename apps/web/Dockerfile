# Build context: repo root (needs root package.json + bun.lock + the
# workspace's package.json for `bun install` to resolve the monorepo).

# ---- builder ----
FROM oven/bun:1 AS builder

WORKDIR /app

COPY package.json bun.lock ./
COPY apps/web/package.json apps/web/package.json
RUN bun install

COPY apps/web apps/web
RUN cd apps/web && bunx vite build

# ---- runtime ----
FROM nginx:alpine

COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/apps/web/dist /usr/share/nginx/html

EXPOSE 80
