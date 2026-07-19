## Why

The transactional outbox delivers each trigger action to a no-op `deliver` seam
(`src/engine/outbox.ts`): actions run nothing and cannot affect the process. This
change makes actions real — resolve a handler by `type`, run it, evaluate
`Action.output` (CEL over the handler's `result`), write the mapped values back
into the instance's `data`, and record the per-action `ActionOutcome`. It closes
the deferred half of the outbox: handlers, result-writeback, and the audit
backfill, making an action observable end-to-end and auditable.

## What Changes

- **Handler registry** (in-process): `type -> { handler, config schema, output
  schema }`. `deliver` resolves and invokes by the outbox row's `action.type`;
  an unknown type or a permanent failure dead-letters.
- **Claim / deliver / mark split.** The handler runs **outside** the claim
  transaction (it does real I/O; holding a DB row lock across it is wrong). A
  second CAS-gated transaction (on the outbox row status) applies the writeback,
  records the outcome, and marks the row delivered. The handler is idempotent on
  the UUIDv5 key, preserving effectively-once under redelivery.
- **Runtime CEL evaluation** of `Action.output` over a `result`-only namespace
  (extend `src/cel/eval.ts`). The outbox row already carries the full `action`
  incl. `output`, so **no frozen `ProcessBody` load is needed** for the writeback.
  Coerces cel-js `bigint`/`number` to JSON-safe values (the runtime twin of the
  authoring `number -> double` papercut).
- **Writeback into `data`** via path-scoped `jsonb_set` on `{data,<fieldId>}` —
  never a wholesale body write.
- **BREAKING (internal — no published definitions exist yet):**
  `transition-execution` stops writing `data` wholesale. A committed transition
  writes only `{currentStepId, transitionSeq, status}` via `jsonb_set`, so it
  never overwrites instance `data`. This disjoint-path rule is what makes the
  writeback clobber-safe against a concurrent transition (Postgres row lock
  serializes two writers that touch non-overlapping jsonb paths).
- **`ActionOutcome` backfill.** The terminal outcome (`resolvedHandler`,
  `status`, `attempts`) is appended to the originating transition's
  `HistoryEntry.actions` (located by `(instanceId, transitionSeq)`).
- **Authoring invariant:** within one transition, the `Action.output` FieldIds
  across its actions MUST be disjoint (a `definition.ts` superRefine + a rejecting
  test) — eliminates the same-field last-writer hazard at authoring time instead
  of with a runtime version vector. Covers the cancel transition too
  (`onCancel` + the sink's `onEntry`), since `onCancel` actions carry `output`.
- **Terminal-instance suppression.** If the instance is `completed`/`cancelled`
  at delivery, the `data` write is suppressed; the `ActionOutcome` is still
  recorded, marked via a new `ActionOutcome.suppressed` flag, keeping terminal
  instances data-immutable and the suppression auditable.

## Capabilities

### New Capabilities
- `action-handlers`: the handler registry and runtime resolution/invocation;
  `Action.output` CEL-over-`result` evaluation; writeback into the instance
  `data`; `ActionOutcome` recording; terminal-instance suppression; and the
  disjoint-output-fields authoring invariant.

### Modified Capabilities
- `transactional-outbox`: delivery changes from one claim-and-mark transaction to
  a claim / deliver / mark split — the handler runs outside the claim
  transaction, and a CAS-gated second transaction (on the row status) applies the
  writeback + outcome + delivered mark. Retry, backoff, and dead-letter are
  unchanged.
- `transition-execution`: a committed transition writes only its
  `{currentStepId, transitionSeq, status}` (path-scoped), never instance `data`.

## Impact

- **Code:** new `src/engine/registry.ts`; `src/engine/outbox.ts` (real
  `deliver` + split + claimed/in-flight status); `src/engine/transition.ts`
  (path-scoped commit); `src/cel/eval.ts` (`result`-namespace `evalOutput` +
  coercion); `src/schema/definition.ts` (two deliberate contract edits: the
  disjoint-output-fields superRefine, and an optional `suppressed` flag on
  `ActionOutcome` for the terminal-suppression audit marker).
- **DB:** outbox gains an in-flight/claimed status (+ reclaim of a stale claim);
  `history_entries.actions` is populated.
- **Tests:** handler resolve + writeback value; `ActionOutcome` recorded with
  status/attempts; double-invocation tolerance; unknown-type dead-letter;
  terminal suppression (no data write, outcome recorded); disjoint-fields
  rejection; and the key correctness test — a writeback survives a subsequent
  transition (data-partition proof).
- **Out of scope (follow-up):** publish-time registry validation (needs a publish
  pipeline to hang on; the runtime path is defensive regardless) and the
  `blocking` execution mode (reserved v1 boundary).
