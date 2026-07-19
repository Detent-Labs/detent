## Why

The contract half of cancellation is built — `definition.ts` carries the reserved
cancel-sink identity, the `onCancel` step field, and `cause: "cancel"`; `compile.ts`
injects the sink at publish time. But the engine has no way to actually cancel a
running instance: there is no cancel entry point, and the transition machinery only
knows how to take authored paths. An instance can be created, transitioned, and
timed out, but never cancelled. This change builds the runtime half so
`status: "cancelled"` is reachable.

## What Changes

- Add an engine cancel entry point (`cancelInstance(instance, body, actor?)`) that
  drives a running instance to the synthesized cancel-sink.
- Cancel executes `onCancel` cleanup then the sink's `onEntry`, **skipping** the
  source step's `onExit` — a synthesized hidden-path transition, not an authored one.
- Record the cancel as one `HistoryEntry` with `cause: "cancel"`, `pathId: null`,
  `toStepId = CANCEL_SINK_STEP_ID`; flip `status` to `"cancelled"`; reuse the
  transactional outbox and advance `transitionSeq` (OCC token), so a cancel racing a
  normal transition resolves cleanly (one wins, no double-apply).
- Generalize the shared commit helper so it can commit a synthesized transition
  (null path, explicit `toStepId`) alongside authored paths.
- **Deferred (explicitly out of scope):** downward-only subprocess cancel
  propagation. Subprocess spawning is not implemented in the engine (no parent/child
  links exist), so there are no children to propagate to. The propagation requirement
  is marked deferred until subprocess execution lands.

## Capabilities

### New Capabilities
<!-- none: runtime cancellation is already specified in the existing cancellation spec -->

### Modified Capabilities
- `cancellation`: the runtime requirements (`Cancel transition semantics and audit
  record`) are being implemented and get a concrete engine entry-point surface; the
  `Downward-only subprocess cancel propagation` requirement is modified to record it
  as deferred until subprocess spawning exists.
- `transition-execution`: the shared commit path is generalized to commit a
  synthesized (null-path) transition, not only an authored `Path`.

## Impact

- `src/engine/transition.ts`: generalize `commitTransition`; add `cancelInstance`
  (or a sibling `cancel.ts`).
- `src/engine/store.ts`: no schema change for single-instance cancel (parent/child
  links deferred with propagation).
- `test/`: new `cancel.runtime.test.ts` (or extend engine tests) covering onExit
  skip, the cancel HistoryEntry, outbox enqueue, and cancel-vs-transition OCC race.
- No contract/`definition.ts` change — the cancel identity and `onCancel` already exist.
