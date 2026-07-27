## Why

The engine has a participant product (`packages/app`) but nothing for the people
who *operate* it. When an instance is parked, an action dead-letters, or a timer
never fires, the only diagnostic tools today are `psql` and a shell. Worse, the
two operator-grade reads that do exist over HTTP — the unfiltered instance
listing and `GET /instances/:id/record` — are reachable by **any** authenticated
actor, so every logged-in participant can list all instances and read anyone's
audit record. This change opens the operator's product and closes that hole in
the same step.

Scope is the first of the three changes the approved design
(`docs/superpowers/specs/2026-07-27-admin-developer-area-design.md`) splits stage
10 into: the package scaffolding, the `system:admin` role, and the Operations
area. User administration (`admin-users`) and the migration run
(`admin-migration-run`) follow separately; the latter also depends on stage 11's
`studio-lifecycle`, which is where a migration plan is registered in the first
place.

## What Changes

- **New reserved role `system:admin`** in `src/auth/authorize.ts`, alongside
  `PUBLISH_ROLE` and `CANCEL_ANY_ROLE`. Same pattern — a constant plus a direct
  `requireRole` check. No policy engine, no hierarchy.
- **BREAKING**: listing instances *unfiltered* and reading an instance record
  now require `system:admin`. `GET /instances` gains an explicit `scope=all`
  (the value the omitted-scope case already meant); `scope=all` and an omitted
  `scope` both require the role, `scope=mine` stays open to every authenticated
  actor. `GET /instances/:id/record` requires the role unconditionally. No
  current caller is affected: the end-user app passes `scope=mine`, and the
  editor's Player drives a single instance it created.
- **New engine module `src/engine/admin-queries.ts`** for the reads that have no
  API today: outbox rows filtered by status with their attempt count and last
  error, counts per status, and pending timers from `instances.next_timer_at`.
- **Two new outbox repairs**: dead-letter requeue (status back to `pending`,
  `attempts` reset, `next_attempt_at` to now) and dead-letter discard. Both are
  pure outbox-row updates — they touch no instance state and therefore cannot
  interact with the `transitionSeq` OCC invariants.
- **New route file `src/http/admin-routes.ts`** carrying `GET /admin/outbox`,
  `POST /admin/outbox/:id/retry`, `POST /admin/outbox/:id/discard` and
  `GET /admin/timers`, all behind `system:admin`, kept out of `routes.ts` so
  that file stays the participant-facing surface.
- **New frontend package `packages/admin`** (React + Vite + TypeScript, same
  shape as `packages/app`): login, a shell that shows an explanatory empty state
  to an authenticated actor without `system:admin`, and the Operations screens —
  all-instances list with `InstanceListFilter` filters and cursor paging,
  instance detail (header plus the merged transition/event record, with cancel),
  outbox with dead-letter retry/discard, and pending timers. `form-ui` is not
  consumed; the admin area renders records, never step forms.

Deliberately out of scope: forced transitions, direct `data` edits, evaluating
CEL against live instance data, deleting users, and live updates (refresh
control plus refetch-on-focus, as in `packages/app`).

## Capabilities

### New Capabilities
- `admin-operations-api`: the operator-facing server surface — `system:admin`
  gating, `admin-queries.ts` (outbox by status, outbox counts, pending timers),
  the two outbox dead-letter repairs, and the `/admin/*` routes that expose
  them.
- `admin-app`: the `packages/admin` frontend — workspace package, login and
  session reuse, role-aware shell, and the Operations screens over the HTTP
  wrapper only.

### Modified Capabilities
- `authorization`: adds a third reserved role, `system:admin`, and states that
  it gates every `/admin/*` route and the two tightened reads.
- `http-wrapper`: `GET /instances` accepts `scope=all`, and both the unfiltered
  listing and `GET /instances/:id/record` now require `system:admin` (403 for an
  authenticated actor without it).

## Impact

- **Code**: new `src/engine/admin-queries.ts`, new `src/http/admin-routes.ts`,
  new `packages/admin/**`; edits to `src/auth/authorize.ts` (one constant),
  `src/http/routes.ts` (`parseScope` plus two role checks) and
  `src/http/server.ts` (dispatch for four routes).
- **API**: four new routes; two existing routes tightened (**BREAKING** for any
  non-`scope=mine` caller lacking `system:admin`).
- **Operations**: an account that needs the admin area must be granted
  `system:admin` via the existing `src/auth/cli.ts set-roles`.
- **Schema**: none. No new table, no new column — `admin-queries.ts` reads
  `outbox` and `instances` as they stand.
- **Dependencies**: none added to the engine; `packages/admin` takes the same
  React/Vite devDependencies as `packages/app`, minus `form-ui`.
