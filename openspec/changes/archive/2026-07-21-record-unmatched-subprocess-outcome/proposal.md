## Why

When a subprocess child returns, `core.returnSubprocess` (`src/engine/subprocess.ts:200-201`)
selects the parent's automatic path whose guard matches `child.outcome`. If none
matches, the handler returns `null` and the outbox row is marked delivered — a
permanent, silent dead end. The `child` namespace (`child.outcome`/`child.data`)
exists only inside that one delivery's transaction; no later re-resolution attempt
can ever reconstruct it and retry the match, so the parent is stranded on its
subprocess step forever with nothing in the runtime record explaining why. The
existing `bounded by a step timer` comment at the call site assumes a mitigation
the schema does not enforce — a subprocess step can legally have no timer at all,
and both shipped examples' cancel-guarding is incomplete for the reserved
`"cancelled"` outcome a downward cancel propagates to a child.

This is the same shape `timer.unarmed` already solved for a declared-but-unarmable
timer: the operation is total and must not fail the entry/delivery, but the
omission must be queryable rather than invisible. This change applies that
precedent to the return path.

## What Changes

- Add a new `InstanceEvent` kind, `subprocess.outcome-unmatched`, to the
  discriminated union in `src/schema/definition.ts`. Its payload names the
  parent's subprocess step and the child outcome (nullable, matching the
  existing `target.outcome ?? null` config shape) that matched no automatic
  path. Like `subprocess.spawn-enqueued` and `timer.unarmed`, it enqueues no
  actions and does not advance `transitionSeq`.
- `core.returnSubprocess` (`src/engine/subprocess.ts`) records this event, in
  the same transaction as the `outputMapping` writeback, whenever the
  `outputMapping` was applied but no automatic path's guard matched
  `child.outcome`. The writeback itself is unaffected — `child.data` already
  landed in the parent's `data` — only the silent `return null` gains an
  audit trail.
- No change to the total, non-failing nature of the handler: an unmatched
  outcome still leaves the parent parked, exactly as today. This change makes
  that outcome observable, not automatically recovered — the same posture
  `timer.unarmed` takes.

## Capabilities

### New Capabilities
(none)

### Modified Capabilities
- `runtime-events`: adds the `subprocess.outcome-unmatched` kind to the
  `InstanceEvent` union, following the existing "actions enqueued, no
  transition" / "no actions, no transition" event shapes.
- `subprocess-execution`: the "Return the child outcome and data to the
  parked parent" requirement gains an explicit, previously-unspecified
  behavior for the no-guard-matched case: it is recorded as an event instead
  of being an unrecorded no-op.

## Impact

- `src/schema/definition.ts`: one new variant in the `instanceEvent`
  discriminated union.
- `src/engine/subprocess.ts`: `makeReturnHandler`'s `if (!path) return null`
  branch gains an `appendInstanceEvent` call inside the existing transaction,
  before returning.
- `test/subprocess.test.ts`: new coverage — an unmatched `child.outcome`
  (including the reserved `"cancelled"` outcome) records the event, the
  parent stays parked, and the writeback is still applied.
- No API, schema, or wire-format change beyond the additive event kind; no
  change to the outbox delivery contract (the row is still marked delivered);
  no change to any other engine entry point.
