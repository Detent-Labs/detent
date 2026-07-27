## Context

Stage 10 of `ROADMAP.md`. The product-level design is already approved:
`docs/superpowers/specs/2026-07-27-admin-developer-area-design.md`. This document
covers only the engineering decisions the first of its three changes needs.

Current state the change builds on:

- `src/auth/authorize.ts` holds two reserved roles (`PUBLISH_ROLE`,
  `CANCEL_ANY_ROLE`), an `AuthorizationError`, and a `requireRole(actor, role)`.
  `src/http/errors.ts` already maps `AuthorizationError` to 403.
- `src/http/routes.ts::parseScope` accepts `mine` or nothing; an omitted `scope`
  means *unfiltered*, and neither that nor `handleInstanceRecord` checks a role.
- `src/runtime/api.ts` provides `listInstances(filter, page, db)` with
  `InstanceListFilter` (`processId`, `status[]`, `currentStepId`, `startedBy`,
  `claimedBy`, `assignedTo`, `assignedToRoles`), `getInstanceRecord` returning a
  merged `Page<InstanceRecordElement>`, and `cancelInstance`.
- `outbox` (`store.ts::initSchema`): PK `idempotency_key`, plus `instance_id`,
  `transition_seq`, `action_id`, `action jsonb`, `status` (free text —
  `pending` / `claimed` / `delivered` / `dead-letter`), `attempts`,
  `next_attempt_at`, `created_at`, `delivered_at`, `claimed_at`, `event_id`,
  `field_version`. Index `outbox_claim_idx (status, next_attempt_at)`.
- `instances.next_timer_at timestamptz` with `instances_timer_idx`; the timer
  scheduler polls `status = 'running' AND next_timer_at <= now()`.
- `packages/app` is the template for a frontend package: React 18 + Vite 6, a
  hand-written History-API routing hook, `session.ts` for the JWT in
  `localStorage`, `api/client.ts`, screen logic extracted into pure modules
  (`screens/inboxLogic.ts`) that are tested while components are not.

Constraint carried from the other frontends: runtime access through the HTTP
wrapper only, never a direct database read from the UI.

## Goals / Non-Goals

**Goals:**

- One reserved role, `system:admin`, gating every operator surface.
- Close the existing hole: the unfiltered instance listing and the instance
  record become role-gated.
- Read APIs for what has none: outbox rows by status, outbox counts, pending
  timers.
- Exactly two new writes, both pure outbox-row repairs.
- A `packages/admin` shell plus the Operations screens.

**Non-Goals:**

- User administration (`admin-users`) and running a migration
  (`admin-migration-run`) — the design's other two changes.
- Anything the product design already excluded: forced transitions, direct
  `data` edits, CEL evaluation against live instance data, user deletion, live
  updates.
- A shared UI component library across `packages/app` and `packages/admin`.
  Two packages is not yet a pattern.

## Decisions

### `scope` becomes a three-state parameter, not a new one

`parseScope` returns `"mine" | "all"`, with an omitted `scope` resolving to
`"all"`. `"all"` requires `system:admin`; `"mine"` does not.

Alternative considered: leave `scope` alone and gate only the explicit
`scope=all`. Rejected — the *omitted* case is the hole. Today `GET /instances`
with no parameters already returns every instance to any authenticated actor, so
gating a new spelling of it while leaving the old one open would close nothing.

Alternative considered: default an omitted `scope` to `"mine"`. Rejected — it
silently changes the meaning of an existing request instead of refusing it, and
a 403 is the honest answer for a caller that is asking for more than it may see.

`scope=mine` combined with an explicit `assignedTo` stays a `RequestShapeError`,
unchanged. The other filters (`processId`, `status`, `currentStepId`,
`startedBy`, `claimedBy`) are orthogonal to the role check: narrowing a listing
does not make it a participant's own listing.

### `getInstanceRecord` is gated unconditionally

No "the record of an instance I am assigned to" carve-out. The record is the
audit backbone — it carries every actor id, every action outcome and every
handler build. A participant-scoped variant would need its own visibility rules
per element kind; that is a product decision nobody has asked for. The
end-user app does not read the record today (case history is explicitly out of
its scope), so nothing regresses.

### `admin-queries.ts` returns rows, not a DSL

Three functions, each a single SQL statement, each taking `db: SQL = sql` like
every other engine module:

- `listOutbox(filter, page, db)` — filter by `status[]` and optional
  `instanceId`; keyset-paged on `(created_at, idempotency_key)` with the same
  cursor encoding `api.ts` already uses, so paging behaves identically to
  `listInstances`.
- `countOutboxByStatus(db)` — one `GROUP BY status`.
- `listPendingTimers(page, db)` — running instances with a non-null
  `next_timer_at`, ordered by `next_timer_at` ascending so overdue comes first.

No generic query builder, no filter DSL. Three call sites, three statements.

The row shape returned by `listOutbox` is deliberately a projection, not
`SELECT *`: `idempotency_key`, `instance_id`, `transition_seq`, `action_id`,
the action's `type` (not its whole `config`, which can hold credentials),
`status`, `attempts`, `next_attempt_at`, `created_at`, `claimed_at` and
`last_error`.

### Last error: a new column, not a jsonb dig

An operator's first question about a dead letter is *why*. That text exists
today only inside the `ActionOutcome` written to the enqueueing record — reaching
it from an outbox row means a jsonb scan across `history_entries` and
`instance_events` correlated by `(instance_id, transition_seq)` or `event_id`.
Instead, `drainOutbox` stamps the failure message onto the row it is already
updating: `ALTER TABLE outbox ADD COLUMN IF NOT EXISTS last_error text`,
idempotent, matching how `claimed_at`, `event_id` and `field_version` were
added. One extra assignment in the two failure branches that already run an
`UPDATE`, and cleared on the success branch.

Alternative considered: derive it at read time from the outcome records.
Rejected — a correlated jsonb scan of the two largest tables to render a list
column, when the writer has the string in hand.

### Requeue and discard are `WHERE status = 'dead-letter'` updates

- Requeue: `SET status = 'pending', attempts = 0, next_attempt_at = now(),
  claimed_at = NULL WHERE idempotency_key = $1 AND status = 'dead-letter'`.
- Discard: `SET status = 'discarded' WHERE idempotency_key = $1 AND status =
  'dead-letter'`.

Both return the affected row count; zero means the row is missing or not a dead
letter, which the route maps to 404 and 409 respectively.

Discard sets a status rather than deleting the row. `idempotency_key` is the
primary key and the deduplication anchor — deleting it would let a replayed
transition re-enqueue the same action, turning a deliberate discard into a
redelivery. `status = 'discarded'` is inert: `drainOutbox` claims only `pending`
and lease-expired `claimed` rows, so nothing picks it up, and the audit trail of
what was discarded survives.

Resetting `attempts` to 0 on requeue is the point of the operation — the row
dead-lettered because it exhausted `MAX_ATTEMPTS`, so requeueing without the
reset would dead-letter again on the next pass.

Neither write touches `instances`, `history_entries` or `instance_events`, so
neither can interact with the `transitionSeq` OCC predicates.

### `admin-routes.ts` mirrors `routes.ts`'s handler shape

Framework-agnostic `handleX(...args, req, resolver, db): Promise<HttpResult>`
functions wrapped by the same `guarded` helper, dispatched from `server.ts`.
Each begins with `requireRole(await resolveActor(req, resolver), ADMIN_ROLE)`.
Splitting the file keeps `routes.ts` the participant surface; sharing the shape
means `errors.ts` and `server.ts` need no new concepts.

### `packages/admin` copies `packages/app`'s shape, not its code

Own `package.json`, `vite.config.ts`, `tsconfig.json`, `index.html`; React 18
and Vite 6; `workflow-engine` as a `file:../..` dependency for
`InstanceRecordElement` / `ActionOutcome` types only. `routing.ts` and
`session.ts` are copied and adapted rather than extracted into a shared package:
they are ~50 lines each, and a `packages/ui-kit` for two consumers with
different route tables is an abstraction ahead of its second real need. If
`packages/studio` (stage 11) needs the same two files, that is the point to
reconsider — three consumers is a pattern.

Screen logic that is worth testing (outbox filter state, timer overdue
classification, record element grouping) goes into pure modules under
`src/screens/*Logic.ts` with `bun:test` coverage; components stay untested. Same
split as `packages/app/src/screens/inboxLogic.ts`.

### The unauthorized shell is an empty state, not a redirect

An actor who authenticates but lacks `system:admin` reaches an explanatory
screen. The role is known client-side from the JWT payload the login response
returns, so the shell does not need to provoke a 403 to find out. The server
check is what enforces; the client check only avoids rendering a UI whose every
request will fail.

## Risks / Trade-offs

- **The `scope` tightening is breaking for an unknown external caller** → No
  in-repo caller is affected (verified: `packages/app` passes `scope=mine`, the
  editor Player addresses a single instance). Called out as **BREAKING** in the
  proposal and to be recorded in `ROADMAP.md`; the remedy is the existing
  `cli.ts set-roles`, as for stage 8's roles.
- **`last_error` may hold sensitive text from a handler failure** (an upstream
  error body, a URL with a token) → It is only ever readable behind
  `system:admin`, the same bar as the record itself. Not truncated or
  redacted; a handler that puts a secret in an error message is the leak, and
  redaction heuristics would hide the diagnostic the field exists for.
- **Requeueing a dead letter re-runs a side effect that may have partially
  happened** → This is inherent to at-least-once delivery and is why the
  idempotency key stays on the row across a requeue: a handler that honours it
  (as `http.request` does, sending `Idempotency-Key`) deduplicates downstream.
  Documented in the outbox screen's confirmation text.
- **`discarded` is a fifth status that no existing code knows about** →
  Both consumers already handle it by construction. `drainOutbox`'s claim
  predicate is an explicit allowlist (`pending` due, or `claimed` with an
  expired lease), so a discarded row is never picked up. `migration.ts` locks
  `WHERE instance_id = $1 AND status <> 'delivered'`, so a discarded row is
  locked and remapped in `field_version` lock-step with the rest — no
  `field_version` canary can fire — and only a *live-claimed* row skips an
  instance `pending-actions`, which a discarded row is not. Both behaviours get
  a test rather than resting on this reading.
- **Two frontends now duplicate `routing.ts`/`session.ts`** → Accepted
  deliberately; revisit when a third consumer appears (stage 11).

## Migration Plan

1. Ship the engine and HTTP changes; `initSchema` adds `last_error` idempotently
   on next start, so no manual DDL and no downtime.
2. Grant `system:admin` to the operator accounts via `bun run src/auth/cli.ts
   set-roles <email> ...` before or immediately after deploy — an operator
   without it sees the empty state, not a broken UI.
3. Rollback is a revert: the added column is unused by the previous build, and
   no row is rewritten by the deploy itself.
