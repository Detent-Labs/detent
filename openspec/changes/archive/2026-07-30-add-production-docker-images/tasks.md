## 1. Build context

- [x] 1.1 Add `.dockerignore` at the repo root, excluding at least
      `node_modules`, `**/dist`, `.git`, `.devcontainer`, `docs`, and
      `test/`.
- [x] 1.2 Add the `docker/` directory.
- [x] 1.3 Run either `docker build` with `--progress=plain` and confirm
      the reported build-context transfer excludes `node_modules` and
      `.git`. A pre-existing local `node_modules` or a large `.git`
      history makes this check meaningful; an empty checkout would pass
      either way.

## 2. Engine image

- [x] 2.1 Add `docker/engine.Dockerfile`, `FROM oven/bun:1.3.11-slim`
      (matching `.devcontainer/Dockerfile`'s `BUN_VERSION`, with a comment
      to bump both together).
- [x] 2.2 Copy the full build context, then run
      `bun install --production --frozen-lockfile`.
- [x] 2.3 Add `USER bun` after install (the base image's own non-root
      user; do not add a new one).
- [x] 2.4 Add a `HEALTHCHECK` that calls `GET /readyz` using `bun -e` and
      Bun's own `fetch`, not `curl` or `wget`. Read the port from
      `process.env.PORT` inside the script, falling back to `3000`, so it
      still targets the right port when `PORT` is overridden at runtime.
- [x] 2.5 Set `CMD ["bun", "run", "src/http/server.ts"]`.
- [x] 2.6 Build the image locally
      (`docker build -f docker/engine.Dockerfile -t workflow-engine:local .`)
      and confirm it completes.
- [x] 2.7 Run the image against a real `DATABASE_URL` and confirm
      `GET /readyz` returns `200`.
- [x] 2.8 Confirm the image starts with neither `AUTH_JWT_SECRET` nor
      `AUTH_ISSUERS` set, and that it fails immediately, naming the
      missing configuration, rather than starting insecurely.
- [x] 2.9 Confirm `ps` inside the running engine container shows the
      server process owned by `bun`, not `root`.
- [x] 2.10 Start the engine container with `PORT` set to something other
      than `3000` and confirm the `HEALTHCHECK` still reports healthy.

## 3. Frontend image

- [x] 3.1 Add `docker/nginx.conf`: a full `server` block, not just the
      fallback line. It needs `listen 8080;` (matching
      `nginxinc/nginx-unprivileged`'s own convention — a non-root user
      cannot bind port 80), `root /usr/share/nginx/html;`,
      `index index.html;`, `gzip on;`, and a `location / { try_files $uri
      /index.html; }` block. No CSP or other security header (the
      build-time `<meta>` tag already covers CSP; see design.md).
- [x] 3.2 Add `docker/frontend.Dockerfile`, build stage
      `FROM oven/bun:1.3.11-slim AS build`: copy the full context, run
      `bun install --frozen-lockfile` (the full install, not
      `--production`), then `bun run --filter "./packages/${PACKAGE}"
      build`, with `PACKAGE` and `VITE_API_URL` as build args.
- [x] 3.3 Add the serve stage, `FROM nginxinc/nginx-unprivileged:alpine`:
      copy `packages/${PACKAGE}/dist` from the build stage into the web
      root, plus `docker/nginx.conf`. Redeclare `ARG PACKAGE` in this
      stage.
- [x] 3.4 Add a `HEALTHCHECK` that runs
      `wget --spider -q http://127.0.0.1:8080/`. Use `127.0.0.1`, not
      `localhost`: this base image resolves `localhost` to `::1` first,
      nginx only binds IPv4, and BusyBox `wget` does not retry a second
      resolved address on connection refused. Confirmed by building and
      running the image: with `localhost` the container stayed
      `unhealthy` (`wget: can't connect to remote host: Connection
      refused`); with `127.0.0.1` it reported `healthy`.
- [x] 3.5 For each of `app`, `admin`, `studio`: build the image
      (`docker build -f docker/frontend.Dockerfile --build-arg
      PACKAGE=<name> --build-arg VITE_API_URL=http://localhost:3000 -t
      <name>:local .`) and confirm it completes.
- [x] 3.6 For each built image, run it and confirm the built page loads,
      and that a deep route (for example `/processes/abc/edit`) does not
      404.
- [x] 3.7 Confirm the built bundle calls the `VITE_API_URL` origin given
      at build time, and that setting a different `VITE_API_URL` as a
      container runtime env var has no effect on the running container.
- [x] 3.8 Confirm `ps` inside a running frontend container shows the
      nginx worker process owned by a non-root user, not `root`.

## 4. Documentation

- [x] 4.1 Add a "Deploy" section to `README.md`: the four `docker build`
      invocations (engine plus one per frontend package), the engine's
      required runtime env vars, and the frontend build's
      `VITE_API_URL` build-arg-only constraint.

## 5. Verification

- [x] 5.1 Run `bun run typecheck` and confirm it passes. This change adds
      no TypeScript, so this confirms no regression.
- [x] 5.2 Run the full `bun test` suite with `DATABASE_URL` set (never a
      single-file rerun) and confirm every test passes, checking the skip
      count as well as the pass count.
