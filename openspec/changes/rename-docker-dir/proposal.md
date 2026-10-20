# Proposal

## Why

The repository holds two directories of container recipes with names that do
not say what separates them. `container/` holds the development image of the
`app` container in the dev pod. `docker/` holds the production images a
deployment runs: `engine.Dockerfile`, `frontend.Dockerfile` and `nginx.conf`.

The name `docker/` names a tool, not a purpose. Since 2026-10-20 the
development host runs Podman, which builds those same files once their base
images carry a registry host, so the tool name says nothing true about the
directory. `deploy/` states what the files are
for, and it reads against `container/` at a glance: one is for development,
the other for deployment.

## What Changes

- **BREAKING** `docker/` becomes `deploy/`. Any external build command that
  names `docker/engine.Dockerfile` or `docker/frontend.Dockerfile` needs the
  new path.
- `deploy/frontend.Dockerfile` copies `deploy/nginx.conf`.
- The three `FROM` lines name their base images with the registry host
  (`docker.io/oven/bun:1.3.11-slim`, `docker.io/nginxinc/nginx-unprivileged:alpine`).
  Podman resolves a short name only through a configured search registry,
  and Docker accepts the full name unchanged.
- Every document, comment and test that names the path follows: `README.md`,
  `docs/runbooks/deployment.md`, `docs/current-state.md`, `docs/decisions.md`,
  `THIRDPARTY.md`, `scripts/enable-hooks.sh`, `packages/web/csp.ts`,
  `packages/web/test/vite-config.test.ts`, `test/enable-hooks.test.ts` and
  `test/http-error-path.test.ts`.
- The build command `docker build` stays as written. The runbook targets any
  host that builds OCI images.
- Out of scope:
  - the capability name `production-docker-images`, which names the images
    rather than the directory;
  - the archived changes, which record the path as it was.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `production-docker-images`: four requirements name the Dockerfiles at
  `deploy/` instead of `docker/`. The Purpose paragraph follows as a direct
  edit of the main spec, since a delta cannot change a Purpose.
- `deployment-runbook`: "The runbook lists every environment variable the
  engine reads" names `deploy/frontend.Dockerfile`.

## Impact

- Moved: `docker/engine.Dockerfile`, `docker/frontend.Dockerfile`,
  `docker/nginx.conf` to `deploy/`.
- Files listed under What Changes, plus the Purpose paragraph of
  `openspec/specs/production-docker-images/spec.md`.
- Ordering: stacks on `slim-claude-md` and archives after it, the last of the
  five stacked changes.
