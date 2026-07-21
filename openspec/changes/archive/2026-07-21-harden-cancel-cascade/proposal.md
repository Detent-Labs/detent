## Why

`cancelInstance`'s downward subprocess-cancel propagation is best-effort and
unrepairable (code-spec-review finding #6). After the parent's own cancel
commits, it sweeps active children in a plain `for` loop with no fault
isolation — one child's failure (or an error deep in a nested grandchild
sweep) throws out of the loop and aborts every remaining sibling. Worse, the
function's own entry guard (`if (instance.status !== "running") return
instance;`) makes re-invoking `cancelInstance` on an already-cancelled parent
a total no-op: it never re-attempts an incomplete sweep. The result is that an
OCC loser, a resolver miss, a crash mid-sweep, or a single child's cancellation
error leaves running children permanently orphaned under a cancelled parent —
and retrying cannot fix it, because the function has no memory of the sweep
ever being incomplete.

## What Changes

- `applyStepEntry` additionally sets a new `cancel_sweep_state = 'pending'` on
  the instance row whenever the commit's resulting status is `'cancelled'`, in
  the same transaction as the commit itself — the same "flag durably inside
  the one shared seam" pattern `harden-cascade-resume` already established for
  `resolve_state`, applied to a new column because `resolve_state`'s existing
  semantics (and the re-resolution worker's `status = 'running'` claim query)
  don't fit a terminal `cancelled` instance.
- `cancelInstance`'s child sweep gains per-child fault isolation: each direct
  child's recursive cancellation is attempted independently (mirroring
  `migrateInstances`' per-instance isolation), grouped into
  `cancelled` / `conflicted` / `failed` outcomes. `cancel_sweep_state` is set
  to `'done'` only when a sweep pass finds no `conflicted` or `failed`
  children; otherwise it is left `'pending'`.
- `cancelInstance` resumes an incomplete sweep: when invoked on an instance
  that is already `status: "cancelled"` with `cancel_sweep_state = 'pending'`
  and a `resolveBody` is supplied, it re-attempts the direct-child sweep
  instead of no-opping. This does not append a `HistoryEntry` or advance
  `transitionSeq` for that instance (its own record is unchanged, matching the
  existing "cancelling a non-running instance is a no-op" contract) — only the
  child cascade is resumed.
- New DB column `instances.cancel_sweep_state` (`'idle' | 'pending' |
  'done'`, default `'idle'`), added via the existing idempotent
  `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` convention in `initSchema`. No
  index: it is read by instance id only, never scanned by a worker.
- No new `InstanceEvent` kind and no background worker: repair is triggered by
  re-invoking `cancelInstance`, the same way `migrateInstances` is
  re-invoked to retry its own `conflicted`/`failed` instances. Operators can
  discover incomplete sweeps with a direct query
  (`status = 'cancelled' AND cancel_sweep_state = 'pending'`).

## Capabilities

### New Capabilities
(none)

### Modified Capabilities
- `cancellation`: the "Downward-only subprocess cancel propagation"
  requirement gains fault isolation (one child's cancellation failure no
  longer aborts its siblings) and a resumable-sweep contract (re-invoking the
  cancel entry point on an already-cancelled instance with an incomplete
  sweep resumes it, without re-appending a `HistoryEntry` or advancing
  `transitionSeq` for that instance).

## Impact

- `src/engine/store.ts`: `initSchema` gains the `cancel_sweep_state` column.
- `src/engine/transition.ts`: `applyStepEntry`'s UPDATE gains a
  `cancel_sweep_state` CASE, conditioned on the commit's resulting status
  being `'cancelled'`; `cancelInstance` restructures its child-sweep loop for
  per-child fault isolation and gains the resume-on-already-cancelled branch.
- `test/`: new coverage — a child cancellation failure does not abort sibling
  cancellation; re-invoking `cancelInstance` on an already-cancelled parent
  with a pending sweep resumes and completes it; a fully-swept cancel converges
  `cancel_sweep_state` to `'done'`; re-invoking cancel on a parent with no
  children (or an already-`'done'` sweep) stays a true no-op.
- No change to the JSON definition contract (`src/schema/definition.ts`), no
  wire-format or `Instance` schema change — `cancel_sweep_state` is an
  engine-internal DB column, not part of the serialized `Instance`, exactly
  like `resolve_state`. No breaking change to `cancelInstance`'s signature or
  to the "cancelling a non-running instance is a no-op" contract observed by
  existing callers that never re-invoke it.
