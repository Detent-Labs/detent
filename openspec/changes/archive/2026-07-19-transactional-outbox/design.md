## Context

`executeManualTransition` (`src/engine/transition.ts`) visits the ordered trigger
actions (`onExit → onPath → onEntry`) through a synchronous no-op `dispatch`
seam, then commits state + `transitionSeq` and appends one `HistoryEntry` in a
single `db.begin` transaction. Side effects are never delivered. A crash between
the commit and any out-of-band dispatch would lose the actions; a naive
redelivery would double-run them.

The contract already carries the runtime shape: `Action` is `{ type, config }`
plus optional `output`; `ActionOutcome` (`resolvedHandler`, `status`, `attempts`,
`idempotencyKey`) and `HistoryEntry.actions` (`optional()`) exist in
`definition.ts`. CLAUDE.md fixes the delivery contract: state committed first,
effects after, at-least-once + a deterministic UUIDv5 idempotency key
(`instanceId + transitionSeq + actionId`) = effectively-once.

## Goals / Non-Goals

**Goals:**
- Enqueue one outbox row per ordered trigger action **inside the existing commit
  transaction**, so an action exists iff its transition committed.
- A polling worker delivers pending rows post-commit, at-least-once, to a handler
  seam, with retry and a dead-letter stop.
- A deterministic UUIDv5 idempotency key on each row (UNIQUE), computed at
  enqueue, so redelivery and re-enqueue are both no-ops.
- Stay within the single Postgres datastore (`Bun.sql`); no new runtime dependency.

**Non-Goals:**
- Handler registry / real `{ type, config }` resolution — the worker calls a seam.
- `Action.output` result-writeback into `data`.
- `ActionOutcome` / `HistoryEntry.actions` back-fill (needs `resolvedHandler` from
  the registry).
- Non-`user` causes (automatic / timer / cancel). The outbox is cause-agnostic
  substrate those callers reuse later; only the manual slice enqueues here.
- Low-latency delivery (LISTEN/NOTIFY), multi-worker fan-out, dead-letter reprocessing.

## Decisions

**D1 — Enqueue in the commit transaction.**
Move the seam out of the pre-commit loop: compute the outbox rows from
`orderedTriggerActions`, then `INSERT` them inside the same `db.begin` block as
the instance `UPDATE` and history `INSERT`. Atomicity is the entire point — a
committed transition and its queued effects share one fate.
_Alternative:_ dispatch directly after commit (no table). Rejected: reintroduces
the crash-between-commit-and-dispatch loss this change exists to close.

**D2 — Poll-based worker with `SELECT … FOR UPDATE SKIP LOCKED`.**
A loop claims `status='pending' AND next_attempt_at <= now()` rows under
`SKIP LOCKED` (safe if more than one worker ever runs), invokes the seam, and
marks the row. Crash recovery is implicit: pending rows survive and are re-claimed
on restart.
_Alternatives:_ LISTEN/NOTIFY (lower latency, more moving parts — defer until
latency matters); external queue e.g. SQS/Redis (new dependency, breaks the
single-datastore rule). Both rejected for v1.

**D3 — UUIDv5 idempotency key at enqueue, from `node:crypto`.**
`idempotencyKey = uuidv5(instanceId + transitionSeq + actionId, NS)` computed via
sha1 (`node:crypto`), stored on the row under a UNIQUE constraint. Deterministic,
so re-executing a transition conflicts on insert (enqueue-dedupe) and the future
handler dedupes on the same key (delivery-dedupe).
_Alternative:_ add a `uuid` dependency — rejected, ~15 lines of stdlib suffice.
_Alternative:_ defer the key to the handler change — rejected, it is a fixed
contract and cheap to materialize now.

**D4 — Delivery is a seam (invoke + mark delivered).**
`deliver(row)` mirrors today's `dispatch` seam; the handler-registry change
replaces its body. For this slice it resolves trivially (no real handler), and
per D6 must be safe to call twice.
_Alternative:_ build the registry now — rejected, out of scope per the proposal.

**D5 — Retry + dead-letter are not optional.**
Columns `attempts`, `next_attempt_at`, and `status ∈ {pending, delivered,
dead-letter}`. A failed delivery increments `attempts` with exponential backoff;
past a max it moves to `dead-letter`. At-least-once without a stop condition loops
a poison row forever, so the dead-letter terminus is required even in v1.

**D6 — Seam must tolerate double invocation.**
At-least-once means a crash after deliver, before mark, re-runs the seam. Until
the idempotency key is consumed by a real handler, the seam is a no-op/idempotent
stub, so this is safe by construction; documented so the registry change keeps it.

## Risks / Trade-offs

- [Poll latency: seconds between commit and delivery] → Acceptable for v1;
  LISTEN/NOTIFY is a later, additive optimization.
- [At-least-once can double-invoke the seam on crash] → The UUIDv5 key exists for
  exactly this; the v1 seam is idempotent (D6), so no harm before the handler lands.
- [Fire-and-forget: instances cannot yet react to action results] → Known;
  `Action.output` writeback is the explicit follow-up.
- [A stuck handler dead-letters after retries with no alert] → v1 records
  dead-letter status; alerting/reprocessing is out of scope.

## Migration Plan

- `initSchema` gains an idempotent `CREATE TABLE IF NOT EXISTS outbox …` (mirrors
  the existing `instances` / `history_entries` init). No data migration.
- Worker started by a small `startOutboxWorker(db)` the host calls; no process
  supervision in v1.
- Rollback: stop the worker and drop the table. Instance state is already
  committed independently, so dropping the outbox loses only undelivered effects —
  no state corruption.

## Open Questions

- Backoff schedule and max-attempts constants — pick concrete values in tasks.
- Worker ownership: same process as the engine vs. a dedicated one. v1 exposes a
  start function and leaves supervision to the host; revisit when deployment shape
  is decided.
