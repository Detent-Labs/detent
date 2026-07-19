## Why

An instance can already end in `status: "cancelled"` (`instanceStatus` in the
contract), but nothing produces that state and nothing defines what happens when
it does — no trigger, no cleanup hook, no audit entry, no subprocess rule. Cancel
is an out-of-band lifecycle event, so the naive fix is to bolt on a special code
path with a nullable `HistoryEntry.toStepId`, which tears a hole in the audit
backbone whose whole premise is that ids resolve against the pinned version body.

This change specifies cancellation so it reuses the existing transition machinery
instead of side-stepping it: cancel becomes a real (engine-synthesized)
transition to a real terminal step, keeping history, hashing, and the
subprocess contract model intact.

## What Changes

- Cancel is modeled as an **engine-synthesized hidden path** from any
  non-terminal step to a synthesized terminal **cancel-sink** step. It is not an
  authored `Path` in `steps[].paths`, so the all-manual/all-automatic invariant
  is untouched.
- A **publish-time compile pass** injects, deterministically and **before**
  `definitionHash = JCS(ProcessBody)` is computed: exactly one cancel-sink step
  per body, plus — for a contracted process — a reserved `"cancelled"` outcome
  bound to that sink. Non-contracted processes get only the sink.
- New authoring invariant: every published body has exactly one cancel-sink with
  its reserved outcome, and the injection is deterministic (idempotent re-publish
  stays a no-op).
- New optional step field **`onCancel: Action[]`** — per-step cleanup that
  becomes the synthetic cancel path's `onPath` actions. Its `action.output`
  targets join the body `superRefine` validation.
- Cancel semantics: it does **not** run the step's normal `onExit`; the order is
  `onCancel` cleanup → `onEntry` of the cancel-sink.
- Cancel is a real transition in the audit record: `HistoryEntry` with
  `fromStepId` = current step, `pathId` = null (no authored path),
  `toStepId` = cancel-sink (resolves — **no nullable needed**), and a new
  `cause` value **`"cancel"`**. `instanceStatus` becomes `"cancelled"`. It reuses
  the outbox (state first, effects after) and `transitionSeq` as the OCC token.
- Subprocess propagation is **downward only**: cancelling a parent walks the
  `parent` links and recursively cancels active children. A cancelled child
  surfaces `child.outcome == "cancelled"`, which the parent may guard on.
  **BREAKING (v1 boundary):** no independent child cancel that propagates upward.

**Scope boundary.** This change covers the contract/schema, the authoring-time
validation, and the publish-time compile pass. The runtime executor behavior
(cancel × outbox at run time) is **specified here but implemented later** with
the engine skeleton. The migration audit-event question is deliberately **out of
scope**.

## Capabilities

### New Capabilities
- `cancellation`: the cancel lifecycle event — hidden-path model, the
  publish-time cancel-sink + reserved-outcome injection, the `onCancel` step
  field, the cancel `HistoryEntry`/`cause`/status result, and the downward-only
  subprocess propagation rule (with the v1 no-upward-cancel boundary).

### Modified Capabilities
<!-- None. No existing spec defines the process-definition contract or its
     authoring invariants as a capability; cancellation is introduced whole. -->

## Impact

- `src/schema/definition.ts` (the contract): new `onCancel` step field; `cause`
  enum gains `"cancel"`; body `superRefine` gains the cancel-sink invariant and
  `onCancel` output validation.
- New publish-time compile pass (module TBD, e.g. `src/schema/compile.ts`) that
  injects the sink + reserved outcome before hashing. No engine exists yet, so
  this is where the injection lands.
- `examples/` — the expense-approval example gains a cancel-sink after compile;
  add a fixture exercising `onCancel` + `child.outcome == "cancelled"`.
- `test/` — new rejection tests for each invariant; a determinism/idempotence
  test for the compile pass.
- No PostgreSQL / `Bun.sql` impact in this change (runtime is later).
- Downstream (later engine): executor must honor the specified cancel × outbox
  ordering and downward propagation.
