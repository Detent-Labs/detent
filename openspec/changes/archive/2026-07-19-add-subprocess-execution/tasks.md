## 1. Reserve the internal action namespace

- [x] 1.1 Add a publish-time invariant rejecting any authored `Action.type` with the `core.` prefix (`RESERVED_ACTION_PREFIX` in `authoredProcessBody`), so the internal `core.spawnSubprocess`/`core.returnSubprocess` handlers cannot collide with a plugin.
- [x] 1.2 Test: a body with a `core.*` action is rejected; a body without one validates. (pure, passes)

## 2. Child body resolution

- [x] 2.1 `contractHash(contract)` in `hash.ts` (JCS of the contract). ponytail: computed on read (no persisted column / migration), newest-first with early stop.
- [x] 2.2 Add `resolveLatestByContract(processId, contractRef)` to `createDefinitionStore`, returning the newest version + body whose `contractHash` equals `contractRef`; `resolveBody(processId, version)` stays the pinned path.
- [x] 2.3 Test: "latest-at-spawn spawns the newest version matching contractRef" — publishes child v1 (contract A), v2 (contract B), v3 (contract A again, newer body); a latest-at-spawn parent with `contractRef = hash(A)` spawns v3 and skips v2. Pinned is covered by every other test. The contract-hash discrimination (A==C≠B) and the newest-match selection are also verified host-side (pure).

## 3. Spawn on subprocess-step entry

- [x] 3.1 Deterministic child id helper `subprocessChildId` = `inst_UUIDv5(parentInstanceId + parentSeq + subprocessStepId)`.
- [x] 3.2 In `commitTransition`, when the target step is a `subprocess` step, enqueue one `core.spawnSubprocess` outbox row (same transaction as the history/outbox insert) carrying `{ subprocessStepId, parentSeq }`.
- [x] 3.3 Internal spawn handler (`makeSpawnHandler`): resolve the child body (§2), evaluate `inputMapping` into the child's initial `data`, `createInstance` with the deterministic id + `parent` link, run the child to rest. No-op if the parent is not `running` or the child already exists (idempotent, `ON CONFLICT DO NOTHING` backstop). Post-insert re-check self-cancels a child orphaned by a racing parent cancel.
- [x] 3.4 `inputMapping` evaluated via `evalFieldMap` (`src/cel/eval.ts`) over the parent guard context, keyed by target child field id.
- [x] 3.5 Test: entering a subprocess step creates a linked child seeded from `inputMapping`; the parent stays parked at the subprocess step.
- [x] 3.6 Test: a redelivered spawn creates no second child (idempotent); a spawn whose parent is no longer running creates no child.

## 4. Return the child outcome to the parent

- [x] 4.1 In `commitTransition`, when a terminal step is committed on an instance that has a `parent`, enqueue a `core.returnSubprocess` action carrying `{ parentInstanceId, parentStepId, childOutcome }`.
- [x] 4.2 Return handler (`makeReturnHandler`): evaluate the parent step's `outputMapping` over `child.outcome`/`child.data` (child data re-keyed via the child body) and merge into the parent's `data` — gated on the parent still parked at the subprocess step and `running`.
- [x] 4.3 The handler advances the parent itself (NOT the generic re-resolution worker): the exit guards read the `child` namespace absent from the standard guard context, so it selects the first hop with `child` in context (`selectAutomaticPath`), commits via `executeAutomaticTransition`, then runs to rest.
- [x] 4.4 Test: child completion applies `outputMapping` to the parent and advances it along the `child.outcome`-matching path (approved and rejected variants).
- [x] 4.5 Test: a child returning to a non-running (cancelled) parent applies no writeback and no advance.

## 5. Downward cancel propagation

- [x] 5.1 In `cancelInstance`, when a `resolveBody` is supplied, after cancelling the parent select running children by `parent.instanceId` and recursively `cancelInstance` each (depth-first; downward only).
- [x] 5.2 Test: cancelling a parent cancels its active child and a nested grandchild.
- [x] 5.3 Test: cancelling an instance with no active children touches only that instance. (The removed "no children before subprocess spawning" deferral scenario is replaced in the `cancellation` delta.)
- [x] 5.4 Test: an independently cancelled child returns `child.outcome == "cancelled"` to the still-running parent (cancel-sink is terminal → enqueues the return), and the parent stays running (no upward propagation — covers the `cancellation` "cancelled child exposes the reserved outcome" and "independent upward child cancel" scenarios).

## 6. Wiring and end-to-end

- [x] 6.1 `startEngine`/`host.ts` registers both internal handlers (`registerSubprocessHandlers`) into the registry, closing over `db`, `resolveBody`, and `resolveLatestByContract`.
- [x] 6.2 Example parent + child under `examples/` (`subprocess-loan-parent.json` + `subprocess-credit-check-child.json`): contracted child, result-driven parent wait-state on `child.outcome`. Both parse + compile (verified).
- [x] 6.3 Integration test (in `test/subprocess.test.ts`): publish parent + child, start a parent, drive the child to a terminal outcome via the outbox, assert the parent takes its result-driven path; separate test asserts a parent cancel cascades to child + grandchild.

## 7. Docs

- [x] 7.1 Update `CLAUDE.md` (Current state + Roadmap #3): subprocess execution done; downward cancel propagation no longer deferred.
- [x] 7.2 Update `README.md` status table + roadmap.

## Verification note

Typecheck (`tsc --noEmit`) is clean. The full `bun test` suite passes against Postgres 16 — **133 pass, 0 fail, 0 skip** (369 assertions), including all 13 subprocess tests (spawn, return approved/rejected, idempotency, parent-not-running, return-to-non-running-parent, cancel cascade to child + grandchild, no-children, latest-at-spawn newest-match, independent-child-cancel exposing the reserved outcome) and every pre-existing DB-backed test (no regressions from the `core.*` invariant, the `evalOutput`/`evalFieldMap` refactor, the `createInstance` extension, the `commitTransition` enqueues, or the `cancelInstance` cascade param). Run against `postgres:16` (the devcontainer's `db` image) via `DATABASE_URL`.
