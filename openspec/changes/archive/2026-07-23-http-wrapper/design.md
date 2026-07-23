## Context

The Runtime API Layer (`src/runtime/api.ts`) exposes exactly three
operations — `createProcessInstance`, `getInstanceView`,
`submitAndTransition` — as plain async TypeScript functions, callable only
in-process. Nothing today lets an external caller (a browser, a script
outside this codebase, the editor's future player) drive an instance. This
was a deliberate non-goal of that change, explicitly deferred: *"An HTTP
wrapper... can sit on top of it later as a thin adapter, once a concrete
consumer exists."*

This design was worked out collaboratively before this OpenSpec change was
opened; the full brainstormed record (including rejected alternatives and
the reasoning behind each choice) lives at
`docs/superpowers/specs/2026-07-23-http-wrapper-design.md`. This document
restates the decisions in the project's standard design-doc shape rather
than re-deriving them.

## Goals / Non-Goals

**Goals:**
- Make the Runtime API Layer's three operations reachable over HTTP as a
  thin, additive adapter — no new capability beyond reachability.
- Keep the background workers (timers, outbox delivery, re-resolution)
  running alongside the server, so async actions and timers actually
  progress for a caller driving an instance over HTTP.
- Stay at zero new dependencies.

**Non-Goals:**
- **A new web framework dependency.** `Bun.serve` native — see "Framework
  choice" below.
- **Real auth.** No sessions, tokens, or headers that resemble real
  authentication.
- **Assignment/claim enforcement.** Unchanged from the Runtime API Layer:
  `actor.id` is recorded but never checked against
  `candidates`/`claimedBy`.
- **List/history endpoints.** Only the three existing operations, 1:1.
- **A new workspace package.** Lives inside the existing engine package
  (`src/http/`), not a new `packages/*` deployable.
- **Precise 404 semantics for not-found resources.** A deliberate,
  documented trade-off — see "Error mapping" below.
- **CORS handling.** No browser caller exists yet; deferred to whichever
  later stage introduces one (the editor's player, Roadmap #5c).

## Decisions

### Framework choice: `Bun.serve` native, not Hono

Considered three approaches:

- **`Bun.serve` native (chosen).** Bun's built-in HTTP server already
  provides path-param routing (`Bun.serve({ routes: {...} })`). Zero new
  dependencies, consistent with this project's existing bias against
  adding a dependency before the surface justifies it (the `editor-ui-i18n`
  change made the same call, skipping i18next/Lingui).
- **`Bun.serve` + Hono.** Nicer middleware ergonomics (CORS, auth
  middleware, a router that scales past a handful of routes) that would
  pay off once Roadmap #5c (browser-based player, needs CORS) and #5d
  (auth middleware) land. Rejected for now: both are speculative future
  stages, and the migration cost later is low (below) — taking on the
  project's first HTTP framework dependency ahead of a concrete need
  would itself be the feature creep this change is meant to avoid.
- **Single RPC endpoint** (`POST /rpc` + `{op, ...}`). Less routing code,
  no real benefit over native routing for 3 operations, worse for future
  observability (logs/metrics can't distinguish operations by
  method+path).

Low lock-in by design: route handlers are framework-agnostic functions —
`(parsed request) -> Runtime API call -> {status, body}` — with no
`Bun.serve`-specific types leaking into them. Both `Bun.serve({ fetch })`
and a Hono app (`app.fetch`) satisfy the same `(Request) => Response`
signature, so a later swap would only rewrite the thin routing/wiring
layer; handler logic, error mapping, and tests (which call the exported
`fetch` handler directly) would not need to change.

### Module shape

New `src/http/` directory in the existing engine package:

- **`src/http/routes.ts`** — three framework-agnostic handler functions.
  Each parses the request, calls the matching Runtime API Layer function,
  and returns a plain `{status, body}`. No `Request`/`Response`
  construction here.
- **`src/http/errors.ts`** — maps a thrown error to `{status, body}` (see
  "Error mapping").
- **`src/http/server.ts`** — `createServer(registry, db = sql)` returns a
  `Bun.serve`-compatible `fetch(req: Request): Promise<Response>` handler
  (translates `routes.ts`'s `{status, body}` into a real `Response`).
  `startHttpServer()` wraps this with `Bun.serve({ fetch, port })` and
  additionally calls `startEngine(db, registry)` (`src/engine/host.ts`,
  already built), so the timer/outbox/resolution background workers run
  alongside the server.

  This matters concretely: without those workers, an instance with an
  async action (e.g. the `expense-approval` example's "book" step) gets
  stuck at its wait-state, exactly as `scripts/demo-expense-approval.ts`
  does without manual `drainOutbox`/`drainResolutions` calls. The HTTP
  server is a long-running process — the natural place to keep those
  workers alive. No new engine code; `startEngine` already exists.

- **Registry is injected, not hardcoded.** `createServer`/`startHttpServer`
  take a `Registry` parameter; the HTTP layer has no opinion on which
  action-handler types exist (real handlers are Roadmap #5e, not yet
  built).
- **Entry point:** `package.json` script `"serve": "bun run
  src/http/server.ts"`, calling `startHttpServer()` when the module runs
  directly. Port via a `PORT` env var, defaulting to `3000` when unset;
  `DATABASE_URL` as already established.

### Routes

No response envelope — success returns the plain resource object as JSON.

| Route | Runtime API call | Success |
|---|---|---|
| `POST /processes/:processId/instances`<br>Body: `{ actor: {id, roles}, version?, data? }` | `createProcessInstance` | `201`, body = `Instance` |
| `GET /instances/:instanceId?actorId=...&roles=a,b` | `getInstanceView` | `200`, body = `InstanceView` |
| `POST /instances/:instanceId/submit`<br>Body: `{ actor: {id, roles}, pathId, data }` | `submitAndTransition` | `200`, body = `Instance` |

### Actor mechanism

The Runtime API Layer takes an explicit `actor: Actor` (`{id, roles}`)
everywhere and trusts whatever it's given (no auth exists — Roadmap #5d).
The HTTP layer mirrors that directly rather than inventing an auth-shaped
mechanism this stage doesn't back with real verification:

- **Write routes** (`POST`): `actor` is a field in the JSON body.
- **The read route** (`GET /instances/:instanceId`): conventional `GET`
  requests don't reliably carry a body (many clients, including `fetch`,
  don't support it), so `actor` is passed via query parameters instead:
  `?actorId=<id>&roles=<comma-separated role list>` (e.g.
  `?actorId=user_1&roles=employee,finance-approver`; `roles` may be
  omitted for `[]`). Judged simpler than making the read a
  `POST /instances/:id/view` just to keep one uniform mechanism.

### Error mapping

`src/http/errors.ts` recognizes exactly the Runtime API Layer's typed
errors; anything else falls back to `500`:

| Thrown | HTTP status | Body |
|---|---|---|
| `SubmissionValidationError` | `422` | `{ error: { type: "validation", issues } }` |
| `GuardRefused` | `409` | `{ error: { type: "guard-refused", message } }` |
| `ConcurrencyConflict` | `409` | `{ error: { type: "concurrency-conflict" } }` |
| `PinMismatch` | `500` | data inconsistency between the definition store and a stored instance — not a client error |
| anything else (plain `Error`, including the Runtime API Layer's own "instance not found" / "no published body for process..." cases) | `500` | `{ error: { type: "internal", message } }` |

**Deliberate trade-off:** the Runtime API Layer throws a plain `Error` (no
dedicated type) for "not found"-shaped failures. Those read more naturally
as `404`, but nothing distinguishes them from a genuinely unexpected
failure (a DB outage, a bug) except the message string. String-matching
the message would be fragile; blanket-mapping every unrecognized error to
`404` would misreport real server failures as "resource not found" and
hide them. This change accepts imprecise status codes for the not-found
case in exchange for not silently mischaracterizing real failures. Fixable
later by introducing a dedicated `NotFoundError` in the Runtime API
Layer — out of scope here (that would be a Runtime API Layer change, not
an HTTP-layer one).

**`AutomaticCascadeLoop`** (submit route only): thrown *after* the
submission's write already committed — the instance is left `faulted`,
not "the request failed." The route handler catches it, re-fetches
`getInstanceView` for the now-current (faulted) state, and returns `200`
with that view. No extra envelope field: the view's own
`status: "faulted"` already signals what happened.

### Testing

`test/http.test.ts` (DB-backed, `test.skipIf(!DATABASE_URL)`, matching
every other suite) calls the exported `fetch` handler directly with `new
Request(...)` and asserts on the returned `Response` — no real port, no
network I/O. Possible only because `Bun.serve` and a plain `fetch` handler
share one signature; also faster and avoids the port-contention risk
`CLAUDE.md` already flags for this repo's parallel DB-backed test files.

Coverage per route: the happy path (including the "book" step's async
settle, driven the same way the demo script does it — no full server
startup needed for a route-level test), each of the five typed error
mappings, the generic `500` fallback, and the actor-passing mechanism
(body vs. query param).

## Risks / Trade-offs

- **[Trade-off]** Not-found cases return `500` instead of `404` — see
  "Error mapping" above. Accepted; revisit only if a concrete consumer
  needs to distinguish them.
- **[Risk]** `Bun.serve` native means hand-rolled request parsing / error
  wrapping instead of a framework's helpers. → **Mitigation:** kept the
  surface at exactly 3 routes and factored handler logic as plain
  functions independent of `Bun.serve`'s types.
- **[Trade-off]** No CORS handling. Not needed yet (no browser caller
  exists); Roadmap #5c (the editor player) will need it, at which point
  either `Bun.serve`'s own header-setting or a framework swap (see
  "Framework choice") picks it up.

## Migration Plan

Purely additive: a new `src/http/` directory, a new `package.json` script,
no changes to `src/runtime/api.ts`, `src/engine/`, or the schema. Rollback
is deleting the new files and the script entry.

## Open Questions

None outstanding for this stage — the not-found/500 trade-off and the
`AutomaticCascadeLoop` handling are pinned down above; real auth,
assignment enforcement, and CORS are explicitly deferred to later Roadmap
stages (#5c/#5d), not decided here.
