# Production image for one of the three frontend SPAs (app/admin/studio),
# selected by the PACKAGE build arg. Genuinely multi-stage: Bun and Vite
# build the assets, but nginx serves them, and nginx cannot run either.
FROM oven/bun:1.3.11-slim AS build

WORKDIR /app

COPY . .

# Full install, not --production: vite and @vitejs/plugin-react are
# devDependencies the build stage itself needs.
RUN bun install --frozen-lockfile

ARG PACKAGE
ARG VITE_API_URL
ENV VITE_API_URL=${VITE_API_URL}

# Vite inlines VITE_API_URL into the built JavaScript at this step. A
# container runtime env var set later has no effect on the result.
RUN bun run --filter "./packages/${PACKAGE}" build

# nginx-unprivileged: non-root by default, listens on 8080, no manual
# reconfiguration needed to match the engine image's non-root USER bun.
FROM nginxinc/nginx-unprivileged:alpine

ARG PACKAGE

COPY --from=build /app/packages/${PACKAGE}/dist /usr/share/nginx/html
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 8080

# 127.0.0.1, not localhost: this Alpine base resolves "localhost" to ::1
# first, nginx's `listen 8080;` binds IPv4 only, and BusyBox wget does not
# fall back to the next resolved address on connection refused.
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --spider -q http://127.0.0.1:8080/ || exit 1
