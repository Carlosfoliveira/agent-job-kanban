# Build context: repo root (needs root package.json + bun.lock + the
# workspace's package.json for `bun install` to resolve the monorepo).
FROM oven/bun:1

# curl is used by the compose healthcheck against /api/health.
RUN apt-get update && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install dependencies first (cached layer) before copying source. Every
# workspace's package.json must be present for `bun install` to reconcile
# against bun.lock (a workspace-aware monorepo lockfile), so both apps'
# manifests are copied even though only the server workspace gets built
# here; --filter server then limits which workspace's deps get installed.
COPY package.json bun.lock ./
COPY apps/server/package.json apps/server/package.json
COPY apps/web/package.json apps/web/package.json
RUN bun install --production --filter server

COPY apps/server apps/server

ENV DB_PATH=/app/data/app.db
EXPOSE 3001

WORKDIR /app/apps/server
CMD ["bun", "run", "start"]
