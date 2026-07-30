## Why

Today the only run path for this project is the devcontainer
(`.devcontainer/Dockerfile`). That image is dev-only by construction: it
mounts the workspace and runs `sleep infinity` instead of starting anything.
No image exists that a deployment could run.

This change is Roadmap #14b, sub-project b of #14. The roadmap sequences it
after #14a, which already shipped the `/livez` and `/readyz` routes. A
production image needs an endpoint for its `HEALTHCHECK` to call, and #14a
is the endpoint that supplies it.

#14c is a backup/restore runbook. It is independent of this change. It
stays out of scope here.

## What Changes

- Add `docker/engine.Dockerfile`: a multi-stage production image for the
  engine. It runs a production install
  (`bun install --production --frozen-lockfile`, no dev dependencies, per
  `development-toolchain`'s "production install can start the engine"
  requirement). It runs as the base image's existing non-root `bun` user.
  Its `CMD` starts `src/http/server.ts`, the same entry point `bun run
  serve` already uses. It declares a `HEALTHCHECK` that calls `GET /readyz`.
- Add `docker/frontend.Dockerfile`: one parameterized multi-stage image
  (build arg `PACKAGE` selects `app`, `admin`, or `studio`) instead of three
  near-identical files. The build stage runs `vite build` with
  `VITE_API_URL` supplied as a **build arg**. Vite inlines
  `import.meta.env.VITE_API_URL` at build time. It cannot be a container
  runtime env var, unlike the engine's `DATABASE_URL`, `AUTH_JWT_SECRET`, and
  `CORS_ALLOWED_ORIGINS`. The serve stage is
  `nginxinc/nginx-unprivileged:alpine`, non-root by default, with a shared
  SPA-fallback config (`docker/nginx.conf`) and a `HEALTHCHECK` against the
  served root.
- Add `.dockerignore` at the repo root (`node_modules`, `**/dist`, `.git`,
  `.devcontainer`, `docs`, test files), so a build context does not ship dev
  artifacts into either image.
- Document build and run usage in `README.md`: the four `docker build`
  invocations, the engine's required runtime env vars, and the frontend
  image's build-arg-only `VITE_API_URL`. This restates the existing
  "Authentication configuration" section's constraint. No image sets
  `ALLOW_INSECURE_DEV_AUTH`. A misconfigured deployment fails loudly, exactly
  as `bun run serve` already does locally.

## Capabilities

### New Capabilities

- `production-docker-images`: the build contract for the four production
  images, one for the engine and one per frontend package. It covers what
  each image runs as, what it exposes, and how it reports health. It also
  covers how configuration reaches it: runtime env for the engine, build
  args for the frontends.

### Modified Capabilities

None. This change makes no HTTP, schema, or engine behavior change.
`/livez` and `/readyz` already exist from #14a. This change only calls
them. It does not change them.

## Impact

- **Code**: `docker/engine.Dockerfile` (new), `docker/frontend.Dockerfile`
  (new), `docker/nginx.conf` (new), `.dockerignore` (new), `README.md`
  (new "Deploy" section).
- **Dependencies**: none added to any package manifest. Building either
  image pulls `nginxinc/nginx-unprivileged:alpine` or the existing
  `oven/bun` base image. The repo does not vendor either one.
- **Out of scope**: a production `docker-compose` or orchestration file. A
  CI workflow that builds or publishes either image to a registry is also
  out of scope. So are TLS/reverse-proxy termination and Kubernetes
  manifests. This change ends at an image that runs correctly under a
  manual `docker run`. Wiring that into a specific deployment platform is a
  separate decision. Also out of scope: the backup/restore runbook, #14c,
  which is independent of this change.
