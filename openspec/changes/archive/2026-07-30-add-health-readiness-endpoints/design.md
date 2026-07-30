## Context

Roadmap #14 ("Deployment & operations readiness") splits into three
independent sub-projects. This change is sub-project a, and it comes first
because #14b depends on it. A production Docker image's `HEALTHCHECK` and a
Kubernetes-style liveness/readiness probe both need an endpoint to call.
Today `src/http/` exposes none. The only run path so far is the
devcontainer, which never asks the question.

This design assumes no specific target orchestrator: not Kubernetes, not
Docker Compose, not a cloud PaaS. Both conventions read the same two
endpoints. A Docker `HEALTHCHECK` can point at either one. A Kubernetes
deployment can wire both probes separately.

## Goals / Non-Goals

**Goals:**
- `GET /livez`: the process is up. No dependency check.
- `GET /readyz`: the process can serve traffic. Checked by a database ping.
- Neither route requires authentication, since an orchestrator has no JWT
  to send.

**Non-Goals:**
- **Background-worker health** (outbox delivery, timer scheduler). `readyz`
  answers one question: can this process serve requests right now. That
  depends only on database reachability. Worker liveness is a different
  question, and the admin area's outbox and timer screens already answer it
  (Roadmap #10). It is not a signal an orchestrator should act on for
  traffic routing.
- **Frontend packages** (`packages/app`, `packages/admin`,
  `packages/studio`). These are static Vite SPAs. In production a web
  server (nginx or equivalent) serves the built assets. That server's own
  health check covers "is the file server up." That server does not exist
  yet. Roadmap #14b covers it, not this change.
- **A configurable timeout on the database ping.** The ping reuses the
  existing `Bun.sql` connection and inherits its own failure behavior. This
  change adds no new timeout configuration.
- **Any detail in the response body beyond a status string.** No database
  failure message. No connection string fragment. No version number. An
  authenticated route may gate some fact. The body must not leak it.

## Decisions

### Route shape

New module `src/http/health.ts` follows the existing framework-agnostic
handler pattern in `src/http/routes.ts`: `(req, ...deps) -> {status, body}`.
It never throws.

- `handleLivez(): Promise<HttpResult>` always returns `{status: 200, body:
  {status: "ok"}}`. It takes no parameters and touches no database.
- `handleReadyz(db: SQL = sql): Promise<HttpResult>` runs `checkDbReady` (see
  below). It returns `{status: 200, body: {status: "ok"}}` on success and
  `{status: 503, body: {status: "unavailable"}}` on failure. It never
  throws.

`server.ts` registers `GET /livez` and `GET /readyz` in its existing
`parts`-based path match, ahead of every auth-dependent route. Neither route
calls `resolveActor` or any `ActorResolver`. Neither route gets an
`OPTIONS` branch for CORS: an orchestrator's health probe is not a browser
request. This matches how the repo already omits CORS handling for
non-browser-facing internals.

The wrapper's existing `toRes` closure applies `corsHeaders(allowedOrigins,
origin)` to every response unconditionally, including the fallback 404.
Reusing it for these two routes would emit `Access-Control-Allow-Origin`
whenever the server carries a `*` or matching-allowlist configuration.
That contradicts "no CORS handling." `server.ts` therefore converts each
route's `HttpResult` with `toResponse(result, undefined, null)` directly,
not `toRes`. Passing `undefined` forces `corsHeaders` to return no header,
regardless of server configuration.

This is a genuine narrowing of three existing `http-wrapper` requirements.
Two are CORS requirements: "applied uniformly to every route" (headers) and
"each of its routes" (preflight). The third is the bearer-token
requirement's `POST /auth/login` exemption list. All three carry a
`MODIFIED Requirements` delta in this change's spec.

**Alternative considered**: routing both through the existing
`guarded`/`mapError` pipeline like every other handler. Rejected. See "Why
not `mapError`" below.

### Database ping as a pure, testable function

`checkDbReady(db: SQL): Promise<boolean>` lives in `src/http/health.ts`. It
runs `SELECT 1` against `db` and returns `true` on success. It catches
whatever the query throws and returns `false` instead. It never calls
`mapError`.

Extracting this as its own function makes the failure branch testable
without a real database outage. A test can pass a `db` stub whose query
rejects and assert that `checkDbReady` resolves `false`. This mirrors the
repo's existing convention of extracting pure logic for testability. For
example, `publishGateLogic.ts` does the same.

### Why not `mapError`

Every other handler in `routes.ts` routes its errors through `guarded` and
`mapError`, which map domain errors (`RequestShapeError`,
`AuthorizationError`, `AutomaticCascadeLoop`) to specific HTTP statuses. A
raw database connection failure has no such mapping today. It would fall
through to `mapError`'s generic-failure branch, most likely landing on a
500.

`readyz` needs a stable, deliberate 503 for this exact case. An orchestrator
treats 503 as "not ready yet, do not route traffic here, do not restart." It
treats 500 as "this process is broken." Conflating the two risks a restart.
A momentarily unreachable database would trigger it, not a broken process.
`handleReadyz` therefore reads `checkDbReady`'s result directly and never
calls `mapError`.

## Risks / Trade-offs

- [A high-frequency `/readyz` poll adds load to the database] → The ping is
  `SELECT 1`, the cheapest query Postgres answers. A configurable timeout
  or rate limit stays an explicit non-goal.
- [A route with no CORS handling is unreachable from a browser-based
  operator dashboard] → Accepted. Neither route targets a browser. An
  orchestrator or a Docker `HEALTHCHECK` calls them directly.
- [Route order in `server.ts` now matters for these two routes] → The
  existing `parts`-based match already orders routes this way. This follows
  that established pattern instead of introducing a new one.

## Migration Plan

Additive only for every existing route's own behavior: two new routes and
one new module, no schema change. The `http-wrapper` capability's CORS and
bearer-token requirements gain a narrower scope, see "Route shape" above.
No already-published route changes what it does. Deploys like any other
code change, no migration step, and no rollback beyond reverting the
commit.

## Open Questions

None. The source design doc
(`docs/superpowers/specs/2026-07-30-health-readiness-endpoints-design.md`)
resolved every functional decision before this proposal.

Its "no CORS handling" intent left one implementation detail unstated.
That detail: how this squares with the existing `http-wrapper`
capability's "applied uniformly to every route" CORS requirement. A
review pass before `/opsx:apply` resolved it. See "Route shape" above and
the `MODIFIED Requirements` in this change's spec. Nothing remains open.
