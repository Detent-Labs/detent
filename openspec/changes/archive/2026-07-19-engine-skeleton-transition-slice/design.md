## Context

The contract and authoring layers exist (`src/schema/definition.ts`,
`src/cel/check.ts`, cancellation contract) but no code executes a definition.
`Instance` and `HistoryEntry` are already defined as Zod schemas; `persistence`
already mandates `Bun.sql` + `DATABASE_URL`; `cel-expressions` already names
`@marcbachmann/cel-js` as the one library for parse and evaluate. This slice adds
the smallest runtime that advances an instance one manual step, so the heavier
runtime changes (outbox, timers, cancel runtime) have machinery to build on.

## Goals / Non-Goals

**Goals:**
- Persist an instance and rehydrate it against its pinned frozen `ProcessBody`.
- Execute one manual transition atomically with `transitionSeq` as the OCC token.
- Append exactly one `HistoryEntry` per committed transition.
- Evaluate a path guard with the shared CEL library, through a projection that
  cannot drift from the authoring-time context.

**Non-Goals:**
- Transactional outbox and action dispatch (side effects). Deferred.
- Timer scheduler, crash recovery, automatic-path priority evaluation, cancel
  runtime. Each a later change.
- Resolving the two open questions below.

## Decisions

### Two tables, one transaction per step
`instances` holds the serialized `Instance` (jsonb) plus promoted columns
`instance_id` (PK) and `transition_seq` (for the OCC predicate). `history_entries`
is append-only, keyed by `instanceId`, matching the schema's own separation
(`Instance` carries no `history` field; `HistoryEntry` carries `instanceId`). A
transition writes both — the instance UPDATE and the history INSERT — in one
`Bun.sql` transaction. *Alternative considered:* history as a jsonb array on the
instance row. Rejected: appends are the audit backbone and a separate table is the
honest append-only model, at no extra cost for one insert.

### transitionSeq is the concurrency token, no separate lock column
Commit is `UPDATE instances SET body=$body, transition_seq=$n+1 WHERE
instance_id=$id AND transition_seq=$n`. Zero rows affected ⇒ a concurrent
transition already advanced the instance ⇒ reject as a conflict, no partial write.
This is exactly the contract's "`transitionSeq` doubles as the optimistic-
concurrency token." *Alternative:* `SELECT ... FOR UPDATE` row lock. Rejected:
heavier, and the schema already designates transitionSeq for this.

### Pin check on rehydrate by recomputing the hash
Rehydration takes the persisted instance and a candidate `ProcessBody`, recomputes
the JCS canonical hash of that body, and refuses if it differs from the instance's
pinned `definitionHash`. Reuses the existing hashing used at publish; the frozen
body is supplied by the caller (a process/version store is a later concern — this
slice takes the body as an argument).

### CEL projection: INSTANCE_SCHEMA becomes the single source of truth
`INSTANCE_SCHEMA` (today a local `const` in `check.ts`) is promoted to a shared
export. Both consumers derive from it: the authoring check registers it (as now),
and the engine's `projectInstance(instance)` builds the runtime `instance`
namespace by taking exactly its keys. The one hand-written mapping is
`instanceId → id`; every other runtime field is dropped. Because the whitelist
lives in one place, changing it updates both sides — the naming-drift landmine
(`instance.id` type-checks at authoring but reads `undefined` at runtime) is
closed by construction, and a test asserts `projectInstance(...).id` equals the
instance's `instanceId` and is never `undefined`. *Alternative:* a second field
list in the engine. Rejected — that is precisely the drift this exists to prevent.

### Ordered trigger seam, dispatch deferred
The executor visits `onExit(source) → onPath → onEntry(target)` in that order
through a single `dispatch` seam that is a no-op in this slice (no side effects
are in scope). The guard on the path is the only trigger with observable runtime
effect now — it gates the transition. Keeping the ordered visit means the outbox
change is a pure addition (replace the seam body), not a reordering. *Alternative:*
skip the ordering entirely until the outbox lands. Rejected: the ordering is a
cheap control-flow skeleton and the spec locks the contract now.

## Risks / Trade-offs

- **Guard-gates-but-no-side-effects reads thin** → the value is the machinery
  (store, OCC, history, projection); the ordered seam makes outbox additive. The
  slice is deliberately thin, not accidentally vacuous.
- **First tests to require a running Postgres** → the devcontainer already
  provides Postgres 16 + `DATABASE_URL`; tests fail loudly if it is unset rather
  than silently passing.
- **Promoting `INSTANCE_SCHEMA` touches working authoring code** → it is a
  move-and-export refactor with no behavior change, guarded by the existing
  `test/cel.test.ts`.

## Migration Plan

Additive. New `src/engine/` code and a projection helper beside `src/cel/`; new
tables created by an idempotent schema-init run against `DATABASE_URL`. No change
to `definition.ts`. Rollback = drop the new tables and delete the engine module;
nothing else depends on them yet.

## Implementation notes (discovered during build)

- **Hash primitive built here.** `src/schema/hash.ts` (`definitionHash`) is a JCS
  subset (sorted-key canonical JSON + sha256), sufficient for a ProcessBody's
  integer/string/bool/null/array/object shape; a `ponytail:` comment names full
  RFC-8785 number canonicalization as the upgrade path. Shared with future
  publishing.
- **DB tests skip, not hard-fail, when `DATABASE_URL` is unset.**
  `test.skipIf(!process.env.DATABASE_URL)` — a skip is visible and is not a false
  green, which satisfies the "never silently pass" intent without turning the
  suite red in a no-DB environment. (Supersedes the "fail loudly" wording above.)
- **Bun.sql returns `jsonb` as text**, so `rehydrate` `JSON.parse`s the column
  before Zod-parsing.
- **`expect(promise).rejects` hangs against Bun.sql** in this Bun version; the DB
  tests assert the caught error directly via a small `rejectsWith` helper.
- **instanceId/historyEntryId are UUIDv4** (the schema enforces only the prefix);
  the contract's UUIDv7 convention is a `ponytail:` upgrade for cross-instance
  time ordering — `transitionSeq` already orders history per instance.

## Open Questions

Both are carried open on purpose; neither blocks this slice.

1. **Dedicated audit event type for version migrations.** The transition-shaped
   `HistoryEntry` (pathId/fromStepId/toStepId, single `version`) does not fit a
   pure version bump. Deferred until migration lands; `cause: "migration"` stays a
   placeholder. Likely resolution: a discriminated union on a `HistoryEntry`
   `kind`. Additive either way, so no cost to defer.
2. **Widening the CEL expression context** (`instance`/`actor` shapes). Stays
   minimal — no v1 guard needs more (four-eyes `data.submitterId != actor.id` and
   role gates `actor.roles.exists(...)` are already expressible). Widen reactively
   when a real guard cannot be expressed; adding fields is non-breaking.
