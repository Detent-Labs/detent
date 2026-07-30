## Why

Roadmap #14 ("Deployment & operations readiness") needs an endpoint for two
callers: a production Docker image's `HEALTHCHECK`, and a Kubernetes-style
liveness/readiness probe. The HTTP wrapper exposes none today: the only
run path so far is the devcontainer, which never asks the question. This
change is sub-project a of #14, and a prerequisite for #14b, which covers the
frontend packages' own health surface.

## What Changes

- Add `GET /livez`: always `200 { status: "ok" }`, no dependency check, no
  actor resolution.
- Add `GET /readyz`: `200 { status: "ok" }` when a database ping
  (`SELECT 1`) succeeds, `503 { status: "unavailable" }` when it fails. No
  actor resolution.
- New module `src/http/health.ts` with `handleLivez`, `handleReadyz`, and the
  pure, independently testable `checkDbReady(db: SQL): Promise<boolean>`.
- Register both routes in `server.ts`'s existing `parts`-based path match,
  ahead of every auth-dependent route. Neither route gets CORS/`OPTIONS`
  handling: an orchestrator probe is not a browser request.
- `readyz`'s failure path never calls `mapError`. A database-ping failure
  maps directly to a deliberate `503`, not the generic-failure `500`
  `mapError` would otherwise produce. An orchestrator's restart and routing
  decisions key off that distinction.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `http-wrapper`: adds two new unauthenticated routes, `GET /livez` and
  `GET /readyz`. Both are pass-through, with no CORS handling.

## Impact

- **Code**: `src/http/health.ts` (new), `src/http/server.ts` (route
  registration), `test/health.test.ts` (new).
- **APIs**: two new unauthenticated GET routes on the existing `Bun.serve`
  wrapper.
- **Dependencies**: none added; reuses the existing `Bun.sql` connection.
- **Out of scope**: background-worker health (outbox/timer liveness) and
  frontend-package health checks (`packages/app`, `packages/admin`,
  `packages/studio`). Those are static SPAs; #14b covers their file-server
  health check. Also out of scope: a configurable ping timeout, and any
  response detail beyond a status string.
