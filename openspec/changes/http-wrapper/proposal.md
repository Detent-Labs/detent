## Why

The Runtime API Layer (`src/runtime/api.ts`) is an in-process TypeScript
boundary only — nothing today lets an external caller or a real UI drive an
instance. This was an explicit, deliberate non-goal of that change ("An HTTP
wrapper... can sit on top of it later as a thin adapter, once a concrete
consumer exists") and is Roadmap #5b in `CLAUDE.md` ("Post-v1: make the
engine reachable"). It is the prerequisite for the editor's future
player/preview UI (Roadmap #5c) and for any other external caller.

## What Changes

- Add a new `src/http/` directory in the existing engine package exposing
  the Runtime API Layer's three operations (`createProcessInstance`,
  `getInstanceView`, `submitAndTransition`) as three REST/JSON routes over
  `Bun.serve` — no new dependency, no new workspace package.
- `POST /processes/:processId/instances`, `GET /instances/:instanceId`,
  `POST /instances/:instanceId/submit`. No response envelope; success
  returns the resource object directly as JSON.
- Actor (`{id, roles}`) is passed in the JSON body for the two write routes
  and via query parameters for the read route (`GET` requests don't
  reliably carry a body). This is not an auth mechanism — no sessions,
  tokens, or headers that could be mistaken for real authentication; the
  Runtime API Layer still trusts whatever actor it's given (Roadmap #5d is
  the separate, later change that adds real auth/actor resolution).
- Typed Runtime API Layer errors map to specific HTTP statuses
  (`SubmissionValidationError` → 422, `GuardRefused`/`ConcurrencyConflict`
  → 409, `PinMismatch` → 500); everything else, including the Runtime API
  Layer's own untyped "not found" errors, falls back to 500 rather than
  guessing at 404 from an error message string.
- `AutomaticCascadeLoop` on the submit route is not an error response: the
  write already committed, so the handler re-fetches the now-faulted
  `InstanceView` and returns 200 with it.
- `startHttpServer()` also calls the existing `startEngine` (`src/engine/host.ts`)
  so the timer/outbox/resolution background workers run alongside the
  server — without them, any instance with an async action gets stuck at
  its wait-state, exactly as `scripts/demo-expense-approval.ts` does
  without manual draining.
- New `package.json` script `"serve"` to run the server; `PORT` env var
  (default 3000).

## Capabilities

### New Capabilities
- `http-wrapper`: the REST/JSON adapter over the Runtime API Layer — the
  three routes, the actor-passing mechanism (body for writes, query
  params for the read), the error-to-status mapping (including the
  `AutomaticCascadeLoop` special case), and the server startup wiring that
  also starts the background workers.

### Modified Capabilities
(none — the Runtime API Layer's own contract, `runtime-api`, is unchanged;
this change only adds a caller on top of it)

## Impact

- New files: `src/http/routes.ts`, `src/http/errors.ts`, `src/http/server.ts`,
  `test/http.test.ts`.
- `package.json`: new `"serve"` script. No new dependencies.
- No changes to `src/runtime/api.ts`, `src/engine/`, or the schema.
