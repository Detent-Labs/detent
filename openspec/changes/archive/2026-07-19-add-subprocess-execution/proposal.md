## Why

The schema already models subprocesses (a `subprocess` step, `ProcessContract`,
`inputMapping`/`outputMapping`, the `child` CEL namespace, and an `Instance.parent`
link), but the engine never spawns a child or returns its outcome — a subprocess
step is an inert wait-state that nothing ever wakes. This is the last core
execution gap in v1 and the blocker for the deferred downward cancel propagation,
which was explicitly parked "until subprocess spawning lands."

## What Changes

- The engine spawns a child instance when a running instance enters a `subprocess`
  step: it resolves the child body (per `versionBinding`), evaluates the step's
  `inputMapping` (CEL over parent `data`) into the child's initial `data`, and
  creates the child with its `parent` link set. The parent parks in the subprocess
  wait-state.
- Child-body resolution honors `versionBinding`: `pinned` binds `pinnedVersion`;
  `latest-at-spawn` binds the newest child version whose contract signature equals
  `contractRef`.
- Spawn is idempotent under the outbox's at-least-once dispatch: a deterministic
  child instance id (UUIDv5 of parent instanceId + `transitionSeq` + subprocess
  step id) makes a re-dispatched spawn a no-op, never a second child.
- When a child reaches a terminal step, the engine reads `child.outcome` (the
  terminal step's bound outcome) and `child.data`, evaluates the parent subprocess
  step's `outputMapping` into the parent's `data`, and flags the parent for
  re-resolution — reusing the existing writeback + re-resolution machinery so the
  parked parent takes its result-driven automatic path.
- Cancelling a parent recursively cancels its active children via the `parent`
  links; a cancelled child surfaces `child.outcome == "cancelled"`. This
  un-defers the propagation requirement in the `cancellation` capability.

Out of scope (unchanged v1 boundaries): no fan-out / multi-instance children, no
independent upward child cancel, no publish-time cross-process authoring
validation (inputMapping-vs-child-contract) — those stay deferred.

## Capabilities

### New Capabilities
- `subprocess-execution`: spawning a child instance on entry to a subprocess step
  (child-body resolution by `versionBinding`, `inputMapping` into the child,
  parent link, idempotent spawn), and returning the child's terminal
  `outcome`/`data` to the parked parent via `outputMapping` writeback and
  re-resolution.

### Modified Capabilities
- `cancellation`: the "Downward-only subprocess cancel propagation" requirement is
  un-deferred — parent cancel now actively cascades to spawned children, and the
  "no children before subprocess spawning" carve-out is removed.

## Impact

- Schema (`src/schema/definition.ts`): no contract change expected — `subprocessSpec`,
  `Instance.parent`, and the `child` namespace already exist. Any tightening lands
  as a refinement with a rejecting test.
- Engine: new spawn/return module in `src/engine/` (parent-entry spawn dispatched
  post-commit through the outbox; child-terminal return flagging the parent
  `resolve_state='pending'`). Touches `transition.ts` (subprocess-step entry,
  `cancelInstance` cascade), `store.ts` (child creation with `parent`; query
  children by parent), `resolution.ts` (parent re-resolution trigger — reused, not
  changed), `definitions.ts` (resolve child body by `pinnedVersion` /
  `contractRef`), and `host.ts` (wire the spawner).
- CEL (`src/cel/eval.ts`): evaluate `inputMapping`/`outputMapping` with the `child`
  namespace at runtime (authoring-time check already exists).
- Tests: new suites for spawn, return, idempotent re-spawn, and parent→child
  cancel cascade; the `cancellation` deferral scenario is replaced.
