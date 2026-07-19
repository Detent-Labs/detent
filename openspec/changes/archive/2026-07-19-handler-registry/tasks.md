## 1. Contract edits (two deliberate schema changes)

- [x] 1.1 Add a process-level superRefine in `src/schema/definition.ts`: for each transition — `[source.onExit, path.onPath, target.onEntry]` for every path on every step, **and** the cancel transition `[source.onCancel, cancel-sink.onEntry]` — the target `FieldId`s across those actions' `Action.output` MUST be disjoint; reject on collision.
- [x] 1.2 Add optional `suppressed: z.boolean()` to the `actionOutcome` schema (additive, so existing serialized outcomes stay valid) — the audit marker for a terminal-suppressed writeback.
- [x] 1.3 Test (`test/validate.test.ts`): two actions on one transition (and separately, two `onCancel` actions on one step) mapping the same output `FieldId` are each rejected; a disjoint mapping is accepted.
- [x] 1.4 Confirm `examples/expense-approval.json` (which uses `Action.output`) still parses under the new refinement (adjust the example only if it violates it).

## 2. Transition data-partitioning (the clobber fix)

- [x] 2.1 In `executeManualTransition` (`src/engine/transition.ts`), change the commit UPDATE from the wholesale `body = ${JSON.stringify(next)}` write to path-scoped `jsonb_set` of `{currentStepId}`, `{transitionSeq}`, `{status}`, keeping the promoted `transition_seq` column and the OCC predicate in the same UPDATE. Leave `{data}` untouched.
- [x] 2.2 Test (`test/outbox.test.ts` or `engine.test.ts`): a value written into an instance's `data` survives a subsequent manual transition (clobber-proof) — this is the load-bearing correctness test for the whole change.

## 3. Runtime CEL result evaluation

- [x] 3.1 Add `buildOutputContext(result)` + `evalOutput(outputMap, result)` to `src/cel/eval.ts` using `@marcbachmann/cel-js`, registering only the `result` namespace. Coerce cel-js `bigint`/`int` to a safe-integer `number` before it lands in JSON-typed `data`.
- [x] 3.2 Test (`test/eval.test.ts`): an `Action.output` expression over `result` evaluates to the expected JSON value; a `bigint` result coerces to `number`; referencing `data`/`instance`/`actor` in an output expression is unresolvable (result-only scope).

## 4. Handler registry

- [x] 4.1 Add `src/engine/registry.ts`: `Registry = Map<type, HandlerDef>` where `HandlerDef = { handler: (ctx) => Promise<result>, configSchema, outputSchema }`, with `register`/`resolve`. Threaded through `startOutboxWorker`/`drainOutbox` (injected like `db`/`deliverFn`), not a global.
- [x] 4.2 Test: `resolve` returns a registered `HandlerDef`; an unknown `type` resolves to undefined (the caller dead-letters it).

## 5. Outbox claim / deliver / mark split

- [x] 5.1 Schema (`src/engine/store.ts` `initSchema`): idempotently add `claimed_at timestamptz` to `outbox` and admit a `claimed` status. The claim query selects due `pending` rows plus `claimed` rows whose lease has expired.
- [x] 5.2 Rework `drainOutbox` (`src/engine/outbox.ts`) into three steps: (tx1) claim a due row `FOR UPDATE SKIP LOCKED`, set `status='claimed'`, `claimed_at=now()`, commit; run the handler **outside any transaction**; (tx2) CAS `UPDATE ... WHERE idempotency_key = ... AND status='claimed'` that applies effects and marks `delivered`. On handler failure, increment `attempts` with backoff or dead-letter (via the same CAS).
- [x] 5.3 Reclaim: a `claimed` row past its lease is returned to `pending` by a later drain. Pick the lease duration and keep the existing backoff constants.
- [x] 5.4 Test: the handler runs off the row lock (a concurrent claim of other due rows proceeds while a handler is in flight); a stale claim past its lease is reclaimed and delivered; restart survival still holds.
- [x] 5.5 Test: the mark is once-only — two markers racing on the same `claimed` row (a reclaimed-then-late worker) apply effects exactly once via the CAS.
- [x] 5.6 Rework the shipped `test/outbox.test.ts` assertions for the split: the SKIP-LOCKED test (currently relies on the row lock being held across delivery, which the split releases at claim) must instead assert tx1-claim contention (two workers never claim the same row); review the retry test's `status='pending'`-after-failure assertion against the new failure path.

## 6. Writeback, ActionOutcome, terminal suppression

- [x] 6.1 Replace the no-op `deliver` (`src/engine/outbox.ts`): resolve the handler by `action.type` (task 4), invoke it with `action.config` to get `result`, evaluate `Action.output` (task 3) into a field->value patch; an unregistered `type` is a permanent failure (dead-letter, no retry).
- [x] 6.2 In tx2 (task 5.2): if the instance is not terminal, apply the patch via chained `jsonb_set` on `{data,<fieldId>}`; append one `ActionOutcome` (`actionId`, `resolvedHandler`=type, `idempotencyKey`, `status`, `attempts`, `at`) to the `HistoryEntry` at `(instance_id, transition_seq)` via `jsonb_set(entry,'{actions}', coalesce(entry->'actions','[]') || <outcome>)`. If terminal (`completed`/`cancelled`), skip the data write and set `suppressed: true` on the `ActionOutcome` (task 1.2).
- [x] 6.3 Test: a mapped output value lands in `data`; the originating `HistoryEntry` carries an `ActionOutcome` with `status: "succeeded"`, the resolved handler, and the attempt count.
- [x] 6.4 Test: an unregistered `type` dead-letters, records `status: "dead-letter"`, and writes no `data`.
- [x] 6.5 Test: a writeback to a `completed` instance writes no `data` and records an `ActionOutcome` with `suppressed: true`.
- [x] 6.6 Test: double-invocation tolerance — delivering the same row twice applies the writeback and the outcome exactly once (CAS on the `claimed` state).

## 7. Verify

- [x] 7.1 `bun test` green (including the Postgres-backed tests) and `bun run typecheck` clean.
- [x] 7.2 `openspec validate handler-registry --type change` passes.
