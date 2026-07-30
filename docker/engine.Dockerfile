# Production image for the engine. Single-stage: Bun runs TypeScript
# directly, so there is no build tool to strip out of a later stage.
# oven/bun:1.3.11-slim pins the same version as .devcontainer/Dockerfile's
# BUN_VERSION -- bump both together, deliberately. The -slim variant ships
# the same non-root `bun` user (UID 1000) as the default tag, at a
# fraction of the size.
FROM oven/bun:1.3.11-slim

WORKDIR /app

COPY . .

# --production skips devDependencies workspace-wide (no vite, no
# typescript in the final image). --frozen-lockfile refuses to resolve a
# dependency tree that drifts from the committed bun.lock.
RUN bun install --production --frozen-lockfile

# The base image already ships a non-root `bun` user (UID 1000); this
# Dockerfile adds no user of its own.
USER bun

EXPOSE 3000

# Reads PORT itself at runtime -- never a hardcoded 3000 -- so this stays
# correct if a deployment overrides PORT. Uses Bun's own fetch instead of
# curl/wget, neither of which this base image ships.
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD bun -e "const p = process.env.PORT || 3000; fetch('http://localhost:' + p + '/readyz').then(r => { if (!r.ok) process.exit(1) }).catch(() => process.exit(1))"

CMD ["bun", "run", "src/http/server.ts"]
