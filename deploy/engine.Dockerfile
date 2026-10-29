# Production image for the engine and the browser bundle it serves. Two
# stages: the build stage holds Vite and the full install, the final stage
# keeps the production install and the built `packages/web/dist` only.
# oven/bun:1.4.4-slim pins the same version as container/Dockerfile's
# BUN_VERSION -- bump both together, deliberately. The -slim variant ships
# the same non-root `bun` user (UID 1000) as the default tag, at a
# fraction of the size.
FROM docker.io/oven/bun:1.4.4-slim AS build

WORKDIR /app

COPY . .

# Full install, not --production: vite and @vitejs/plugin-react are
# devDependencies the bundle build needs. This stage sets neither
# NODE_ENV nor USER.
RUN bun install --frozen-lockfile

# No VITE_API_URL: the engine serves the bundle, so the browser calls the
# API on its own origin.
RUN bun run --filter "./packages/web" build

FROM docker.io/oven/bun:1.4.4-slim

WORKDIR /app

COPY . .

# --production skips devDependencies workspace-wide (no vite, no
# typescript in the final image). --frozen-lockfile refuses to resolve a
# dependency tree that drifts from the committed bun.lock.
RUN bun install --production --frozen-lockfile

COPY --from=build /app/packages/web/dist /app/packages/web/dist

# The server serves the shell and assets from this directory.
ENV WEB_ROOT=/app/packages/web/dist

# The server already passes `development: false` to Bun.serve. This keeps
# every other Bun code path that reads NODE_ENV out of development mode.
ENV NODE_ENV=production

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
