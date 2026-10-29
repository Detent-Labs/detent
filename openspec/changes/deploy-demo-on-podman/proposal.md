# Proposal

## Why

The demo server ran on Docker. Its deploy stack lived only in the untracked
`tmp/` of a retired machine, and nothing in this repository described it. The
server is now a fresh Debian 13 VPS at `detent.org` with 1 vCPU, 2 GB RAM and
20 GB disk. The owner prepared it for rootless Podman and chose a green
start: no old data moves over.

The owner also chose a public demo. Anyone with the link signs in with the
seed's known accounts, the operator and developer areas included. Visitors can
then change or delete anything. The demo therefore needs a nightly reset and a
bound on what a visitor can make it do.

## What Changes

- `deploy/engine.Dockerfile` gains a build stage. The final image carries the
  built browser bundle and serves it from `WEB_ROOT`. The demo then runs one
  origin with no nginx container. The final stage still installs production
  dependencies only.
- A new directory `deploy/demo/` holds the whole demo definition. That covers
  the Quadlet units for one pod, which runs Postgres, the engine and Caddy. It
  also holds the `Caddyfile` and an environment template. A setup script, a
  reset script and a systemd timer for the nightly reset complete it.
- `scripts/deploy-demo.sh` builds the engine image on the developer's machine.
  It ships the image to the server over SSH, copies `deploy/demo/` and
  restarts the pod.
- `docs/runbooks/demo.md` describes the server preparation, the first deploy,
  a later deploy and the reset.
- The environment template denies outbound effects and bounds uploads at
  1 MiB.
- `README.md` loses its `.devcontainer/` migration note, and `.gitignore`
  loses its `.devcontainer/` line. No clone with that directory remains.

## Capabilities

### New Capabilities

- `demo-deployment`: the public demo's deployment definition, its nightly
  reset and the bounds a public demo needs.

### Modified Capabilities

- `production-docker-images`: adds "The engine image carries the built
  browser bundle".

## Impact

- `deploy/engine.Dockerfile`, new files under `deploy/demo/`,
  `scripts/deploy-demo.sh`, `docs/runbooks/demo.md`,
  `docs/runbooks/deployment.md` (one link), `README.md`, `.gitignore`,
  `scripts/seed.ts` (one comment), and new tests.
- No engine, HTTP or definition contract behavior changes.
- The two backfill scripts stay for a follow-up change. A green start leaves
  no data for them. Removing them retires two spec requirements, which is its
  own decision.
