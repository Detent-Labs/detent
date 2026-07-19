## Context

The transactional outbox (`src/engine/outbox.ts`) claims pending rows and calls a
no-op `deliver` seam inside its claim transaction. The contract already carries
the runtime shape this change fills: `Action.output` (record of FieldId -> CEL
over `result`), the `plugin` envelope `{type, config}`, `ActionOutcome`
(`resolvedHandler`, `status`, `attempts`, `idempotencyKey`), and the optional
`HistoryEntry.actions`. Authoring-time CEL (`src/cel/check.ts`) already registers
the `result` namespace for `Action.output`; the engine-side evaluator
(`src/cel/eval.ts`) builds only a guard context and does not. No handler registry
exists, and the instance body is a single jsonb row that `executeManualTransition`
currently rewrites wholesale (`transition.ts:82`).

## Goals / Non-Goals

**Goals:**
- Resolve a handler by `action.type`, run it, evaluate `Action.output` over its
  `result`, and write the mapped values into the instance's flat `data`.
- Record a per-action `ActionOutcome` on the originating transition's
  `HistoryEntry`.
- Do the above safely: no clobber of concurrent transitions, effectively-once
  under redelivery, handler I/O off the DB row lock.

**Non-Goals:**
- Publish-time registry validation (no publish pipeline exists to hang it on; the
  runtime deliver path is defensive regardless). Deferred.
- The `blocking` execution mode — reserved v1 boundary.
- Recording the evaluated output values (or a hash) in `ActionOutcome` for deep
  replay; the schema records only `resolvedHandler`/`status`/`attempts`.
- Handler versioning: `resolvedHandler` is the registry `type` until handlers are
  versioned.

## Decisions

**D1 — Writeback is orthogonal to `transitionSeq`.**
The writeback neither bumps `transitionSeq` nor uses it as an OCC token on the
instance UPDATE (`WHERE instance_id = ...` alone). The row's frozen
`transition_seq` is used only as a coordinate to locate the `HistoryEntry` the
`ActionOutcome` belongs to.
_Alternative:_ bump/OCC-guard on the seq — rejected: the async handler returns
after the instance has legitimately advanced to a higher seq, so an OCC predicate
would spuriously fail, and bumping the seq masquerades a side-effect completion as
a transition, corrupting the token.

**D2 — jsonb path-partitioning (the clobber fix).**
`transition.ts` stops writing `body` wholesale and `jsonb_set`s only
`{currentStepId}`, `{transitionSeq}`, `{status}` (keeping the promoted
`transition_seq` column + OCC in the same UPDATE). The writeback `jsonb_set`s only
`{data,<fieldId>}`. Two writers touch disjoint jsonb paths, so the Postgres row
lock serializes them with no lost write.
_Alternative:_ keep the wholesale write and add a data-level OCC or read-under-lock
— rejected: more machinery; disjoint paths + the existing row lock give
correctness for free. Transitions never semantically set `data`
(`executeManualTransition` takes no data payload), so the transition loses nothing.

**D3 — Claim / deliver / mark split (chosen).**
`drainOutbox` becomes three steps: (tx1) claim due rows `FOR UPDATE SKIP LOCKED`,
flip `pending -> claimed` with a `claimed_at` lease, commit (release the lock);
run the handler **outside any transaction**; (tx2) a CAS `UPDATE ... WHERE
idempotency_key = ... AND status = 'claimed'` applies the writeback + appends the
`ActionOutcome` + flips `claimed -> delivered`. A stale `claimed` row (crashed
worker) past its lease is returned to `pending` and re-claimed.
_Alternative:_ run the handler inside the claim tx (single transaction) —
rejected: a real handler does I/O; holding a DB row lock across it is wrong, and a
handler whose external effect committed but whose tx then failed would re-fire on
redelivery. The split keeps the lock off I/O; the handler is idempotent on the
UUIDv5 key.
_The CAS is status-based (`WHERE status = 'claimed'`), not claim-token-based: a
worker whose lease expired can still commit its (valid, already-computed) result,
and a reclaimed-then-late peer's CAS then no-ops on `status = 'delivered'`. So the
lease bounds duplicate **handler runs**, while the CAS gives exactly-once **data +
audit**; handler idempotency on the key is the real once-guarantee for external
effects. (A claim-token CAS would cut duplicate handler runs but is not needed for
data correctness — deferred.)_
_This split changes the outbox locking model: the shipped SKIP-LOCKED test (which
relies on the lock held across delivery) is reworked to assert tx1-claim
contention — see tasks 5.6._

**D4 — Runtime `result`-only CEL eval; no body load.**
Add `buildOutputContext(result)` + `evalOutput(outputMap, result)` to
`src/cel/eval.ts`, evaluating each `Action.output[fieldId].src` against a
`{ result }`-only context (the contract scopes `result` to `Action.output` alone).
The outbox row already carries the full `action` incl. `output`, so no frozen
`ProcessBody` load is needed. cel-js `bigint`/`int` is coerced to a safe-integer
`number` before it lands in JSON-typed `data` (the runtime twin of the authoring
`number -> double` papercut).
_Alternative:_ load the frozen body to re-resolve the mapping — rejected: the
action (with its output mapping) is on the row; output eval needs only `result`.

**D5 — `ActionOutcome` appended to the originating `HistoryEntry`.**
`entry.actions` is populated via `jsonb_set(entry, '{actions}',
coalesce(entry->'actions','[]') || <outcome>)` on the entry at
`(instance_id, transition_seq)` — that entry's `transitionSeq` equals the row's
`transition_seq`. Records `resolvedHandler` (registry `type`), terminal `status`,
`attempts`.

**D6 — Disjoint output fields, authoring invariant (chosen).**
A `definition.ts` superRefine rejects a transition whose actions' `Action.output`
FieldIds are not disjoint (with a rejecting test, per repo convention). The action
set per transition is `[source.onExit, path.onPath, target.onEntry]`, and — since
`onCancel` actions carry `output` (definition.ts already treats onEntry/onExit/
onCancel uniformly) — also the cancel transition's `[source.onCancel,
cancel-sink.onEntry]`. Eliminates the same-field last-writer hazard at authoring
time.
_Alternative:_ a runtime per-field version vector or last-writer-wins — rejected:
new runtime machinery vs a one-time authoring rule.

**D7 — Terminal-instance suppression (chosen).**
The suppression check is a single conditional UPDATE, not a read-then-write: the
data write is `UPDATE instances SET body = jsonb_set(...) WHERE instance_id = ...
AND (body->>'status') NOT IN ('completed','cancelled')`; zero rows affected means
the instance was terminal, so the writeback is suppressed and the `ActionOutcome`
is recorded with `suppressed: true` (and `status` still reflecting the handler
outcome — suppression is orthogonal). Making the decision atomic with the write
avoids a TOCTOU where the instance goes terminal between a status read and the
write. Because
`ActionOutcome.status` (`succeeded`/`failed`/`dead-letter`) cannot express
suppression — the handler did succeed, only the writeback was dropped — this adds
an optional `suppressed: boolean` to `ActionOutcome` in `definition.ts` (the
second deliberate schema edit, alongside D6). Terminal instances stay
data-immutable and the drop is auditable.
_Alternative 1:_ apply the write (data is lifecycle-stable) — rejected: leaves
terminal instances data-mutable.
_Alternative 2:_ record `status: succeeded` with no marker — rejected: suppression
is then not reconstructable from the audit trail, only inferable from absent data.

**D8 — Registry is an in-process seam.**
`src/engine/registry.ts`: `Map<type, HandlerDef>` where `HandlerDef = { handler:
(ctx) => Promise<result>, configSchema, outputSchema }`. Threaded through
`startOutboxWorker`/`drainOutbox` like the existing `db`/`deliverFn` injection, so
tests register a handler without a global. Unknown type -> `PermanentError` ->
dead-letter.

## Risks / Trade-offs

- [The `transition.ts` change is to already-merged, shipped code; omitting it
  silently reverts every writeback on the next transition] → The clobber-proof
  test (a writeback survives a subsequent transition) is the required guard.
- [The split adds a `claimed` state + a stale-claim lease; a crashed worker leaves
  a row `claimed`] → A later drain re-leases `claimed` rows past their lease (a
  fresh claim, in the same claim query as due `pending` rows); tx2 is CAS-gated so
  a reclaimed-then-late worker cannot double-apply.
- [The dead-letter bound ("a permanently failing action cannot loop forever")
  covers *throwing* handlers: a throw reaches tx2, which increments `attempts` and
  dead-letters at the max. A handler that instead *kills the process* (OOM,
  SIGKILL) never reaches tx2, so its reclaim does not count an attempt and the row
  re-runs indefinitely] → Deliberate v1 boundary: a process-crashing handler is a
  handler bug (handlers must throw, not crash), and at-least-once + idempotency
  make the re-run safe. Counting reclaims as attempts is rejected — an infra
  restart (deploy) mid-lease would then false-dead-letter a healthy row.
- [At-least-once can re-run a handler whose external effect already succeeded] →
  Now the handler's contract: it MUST dedupe on the `idempotencyKey`. Documented
  at the seam.
- [`ActionOutcome` located by `(instanceId, transitionSeq)` assumes one
  `HistoryEntry` per seq] → True for transitions today; a future migration audit
  event sharing a seq would break the 1:1 lookup. Note for the migration change.
- [`resolvedHandler = type` and no recorded output values] → Limits deep replay;
  acceptable until handler versioning lands.

## Migration Plan

- `initSchema` gains an idempotent `ALTER TABLE outbox ADD COLUMN IF NOT EXISTS
  claimed_at timestamptz` and admits the `claimed` status; no data migration.
- `transition.ts` commit switches wholesale `body` write to path-scoped
  `jsonb_set`; existing rows already carry the needed jsonb paths.
- `definition.ts` gets two authoring-time edits — the disjoint-output-fields
  superRefine and the optional `ActionOutcome.suppressed` flag (additive, so
  existing serialized outcomes stay valid). Verify `examples/expense-approval.json`
  (which does use `Action.output`) satisfies disjoint output fields (adjust if not).
- Rollback: reverting `deliver` to the seam is clean, but reverting the
  `transition.ts` wholesale write would clobber any already-applied writeback — so
  once shipped, the partitioning is load-bearing (call out in the PR).

## Open Questions

- Stale-claim lease duration and the split's backoff constants — pick concrete
  values in tasks.
- Whether `ActionOutcome` should eventually record the mapped output values (or a
  hash) for replay — deferred; revisit if replay is needed.
