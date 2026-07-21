## Context

`cancelInstance` (`src/engine/transition.ts:404-431`) commits the target
instance's own cancel transition through the shared `commitTransition` seam,
then — only when a `resolveBody` resolver is supplied — queries for active
(`status = 'running'`) children by their `parent` link and cancels each
recursively in a plain `for` loop:

```ts
for (const row of rows) {
  const child = instanceSchema.parse(...);
  const childBody = await resolveBody(child.processId, child.version);
  if (childBody) await cancelInstance(child, childBody, actor, db, resolveBody);
}
```

Two problems compound:

1. **No fault isolation.** A throw from any iteration (a `ConcurrencyConflict`
   on the child's own commit, an error surfacing from a nested grandchild
   sweep, a DB error) propagates out of the `for` loop and aborts every
   sibling not yet visited. The caller sees an exception; siblings after the
   failed one are never even attempted.
2. **No durable memory of an incomplete sweep.** The function's own entry
   guard is `if (instance.status !== "running") return instance;`. Once the
   parent's own commit has landed `status: "cancelled"`, every future call to
   `cancelInstance` on that same instance hits this guard and returns
   immediately — the child sweep is never reattempted, whether the previous
   attempt threw, crashed mid-loop, or was never run at all (no `resolveBody`
   the first time).

The `cancellation` spec's "Downward-only subprocess cancel propagation"
requirement only commits to *what* gets cancelled (active children,
recursively), not to fault isolation or resumability — this is the gap.

The sibling change `harden-cascade-resume` (already landed) established the
pattern this change follows: flag durably, inside the one seam every commit
already goes through (`applyStepEntry`), in the same transaction as the
commit — rather than having the caller remember to flag itself. That change's
`design.md` explicitly scoped #6 out ("a different failure shape... not a
'commit, then crash before cascading' gap") and reserved it for its own
change. This is that change.

Why not reuse `resolve_state`? Its only reader is the re-resolution worker's
claim query, which is `WHERE body->>'status' = 'running' AND resolve_state IN
(...)`. A cancelled instance is never `running` again, so a flag on
`resolve_state` would be permanently invisible to the one thing that reads it,
and the resolution worker has no business driving a child-cancellation sweep
regardless — it drives automatic *guard* re-evaluation, an unrelated concern.
This needs its own column with its own (simpler) contract: read by instance id
only, on demand, by `cancelInstance` itself.

Instance migration (`migration.ts`) already establishes the fault-isolation
half of this pattern independently: `migrateInstances` migrates each instance
in its own try/catch, groups outcomes into
`migrated / skipped / conflicted / failed`, and leaves `conflicted`/`failed`
instances for a later re-invocation to retry — it does not retry internally in
a loop. The child sweep adopts the same per-item isolation and outcome
grouping, at the scale of "one parent's direct children" rather than "the
whole migrating population."

## Goals / Non-Goals

**Goals:**
- A single failed (or racing) child no longer prevents its siblings from
  being cancelled in the same sweep pass.
- The fact that a cancelled instance's child sweep did not fully succeed must
  survive a crash and be discoverable, so an operator (or an automated retry)
  can act on it — the same durability property `resolve_state` already gives
  the run-to-rest cascade.
- Re-invoking the existing `cancelInstance` entry point on an already-cancelled
  instance must be able to make progress on an incomplete sweep, with no new
  public function and no change to its signature.
- Preserve the existing "cancelling a non-running instance is a no-op: no
  `HistoryEntry`, no `transitionSeq` advance" contract for the instance's own
  record — the resumed work is entirely the child cascade, never a second
  cancel transition on the same instance.

**Non-Goals:**
- No background worker or scheduler for cancel-sweep repair. Like
  `migrateInstances`, resumption is invocation-driven: something (an operator,
  an ops script, a future automated job) calls `cancelInstance` again. Building
  that automation is out of scope here.
- No full-subtree self-healing in one call. `cancelInstance`'s resume path
  repairs only its own *direct* children's sweep. If a grandchild's sweep is
  independently left `'pending'` (because the immediate child's own recursive
  call partially failed), that is discoverable and repairable by re-invoking
  `cancelInstance` on *that* child directly — the same per-node repair
  contract applies uniformly at every level, it just is not walked
  automatically top-down in one call. This matches how a `migrateInstances`
  caller retries by calling it again, not by the function chasing every
  transitively-affected row itself.
- No new `InstanceEvent` kind. The review suggests an event for finding #5
  (unmatched `child.outcome`); #6's failure mode is fully captured by a
  queryable durable column, and adding an event kind is a larger, separately
  decidable surface (the runtime-events spec calls the four existing kinds
  "additive but settled" — not a reason to avoid a fifth, but not something
  this narrowly-scoped change should decide as a side effect either).
- No change to upward (child-initiated) cancel propagation — still not a v1
  feature, unaffected by this change.
- No change to `resolve_state`, the re-resolution worker, or any behavior
  besides the cancel cascade.

## Decisions

### A new `cancel_sweep_state` column, flagged inside `applyStepEntry`

Add `instances.cancel_sweep_state text NOT NULL DEFAULT 'idle'` via the same
idempotent `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` convention already used
for `resolve_state`, `next_timer_at`, etc. `applyStepEntry`'s existing UPDATE
gains one more conditional column, mirroring the `resolve_state` CASE it
already carries:

```sql
cancel_sweep_state = CASE WHEN ${next.status} = 'cancelled' THEN 'pending' ELSE cancel_sweep_state END
```

Because `applyStepEntry` is the one seam every step-entry commit (authored or
synthesized) already goes through, and `cancelInstance` is the only caller
that ever passes `{ status: "cancelled" }` as an override, this flags exactly
the cancel commit and nothing else — no cancel-specific code path needs to
remember to set it, matching the `harden-cascade-resume` precedent's
rationale for doing this at the seam rather than at each call site.

Three states, not two: `'idle'` (never cancelled, or not relevant — the
default), `'pending'` (cancelled; the direct-child sweep has not yet
completed without conflict or failure), `'done'` (a sweep pass completed with
zero `conflicted`/`failed` direct children). No index: unlike `resolve_state`,
nothing scans this column — `cancelInstance` reads it by `instance_id` only,
on demand, when it is invoked on an instance it discovers is already
`cancelled`.

**Alternative considered:** reuse `resolve_state`. Rejected — see Context
above; its reader excludes non-`running` rows by construction, so a cancelled
instance's flag would be permanently dead.

### Per-child fault isolation with grouped outcomes, not a resumable cursor

The sweep becomes:

```ts
async function sweepCancelledChildren(
  parentInstanceId: string, actor: Actor, db: SQL, resolveBody: ResolveBodyFn,
): Promise<{ cancelled: string[]; conflicted: string[]; failed: string[] }> {
  const rows = /* SELECT body FROM instances WHERE parent link = parentInstanceId AND status = 'running' */;
  const result = { cancelled: [], conflicted: [], failed: [] };
  for (const row of rows) {
    try {
      const child = instanceSchema.parse(...);
      const childBody = await resolveBody(child.processId, child.version);
      if (!childBody) { result.failed.push(child.instanceId); continue; }
      await cancelInstance(child, childBody, actor, db, resolveBody);
      result.cancelled.push(child.instanceId);
    } catch (e) {
      if (e instanceof ConcurrencyConflict) result.conflicted.push(row.instanceId);
      else result.failed.push(row.instanceId);
    }
  }
  if (result.conflicted.length === 0 && result.failed.length === 0) {
    await db`UPDATE instances SET cancel_sweep_state = 'done' WHERE instance_id = ${parentInstanceId}`;
  }
  return result;
}
```

`ConcurrencyConflict` is bucketed separately from other failures, exactly as
`migrateInstances` does, because it is not evidence of a broken child — it
means another commit (a concurrent cancel, a racing transition) already moved
that child's `transitionSeq`, most plausibly a second concurrent sweep of the
same parent (see below) or the child's own independent progress. Treating it
as `failed` would spuriously block convergence even when the child ends up
correctly cancelled by the racing caller. Leaving `cancel_sweep_state`
`'pending'` on any non-empty `conflicted`/`failed` bucket (rather than
partially advancing it) keeps the state machine to the same two readable
outcomes migration already uses operationally: "fully done" or "retry me."

**Why this converges even though `cancel_sweep_state` doesn't track *which*
children remain:** a retried sweep re-runs the same `status = 'running'`
query. Any child the previous pass already cancelled (in `cancelled`) is
excluded by construction. Any `conflicted` child was, by definition, moved by
someone else — most often already non-`running` by the time of the retry — so
it too drops out of the query. Only genuinely `failed` children (a resolver
returning nothing, a non-conflict exception) persist across retries, which is
correct: they need the underlying cause fixed, not just a re-attempt.

**Alternative considered:** record a per-child resume cursor (e.g., a list of
already-attempted child ids) so a retry only touches previously-failed
children. Rejected as unnecessary complexity — the `status = 'running'` query
is already a correct, self-maintaining "what's left" filter; a cursor would
duplicate information the query already gives for free, the same reasoning
`migrateInstances` uses for its keyset pagination over *unmigrated* rows
rather than a separate progress log.

### Concurrent sweeps of the same parent are safe, not prevented

Two overlapping calls to `cancelInstance` on the same already-cancelled parent
(e.g., a synchronous caller's own post-commit sweep racing an operator's
manual repair) are not locked against each other. Both read the same
`status = 'running'` child set and may both attempt to cancel the same child;
one wins the child's own `transitionSeq` OCC predicate inside its
`commitTransition`, the other observes `ConcurrencyConflict` and buckets it as
`conflicted` (not `failed`), so it neither corrupts state nor blocks
convergence. Both sweeps race harmlessly to write `cancel_sweep_state =
'done'` if both happen to see zero conflicts/failures; the column has no
version predicate because nothing else concurrently reads-then-conditionally-
writes it (unlike `resolve_state`'s claim/lease dance, there is no "claimed"
intermediate state to protect here — every writer of `'done'` is asserting a
fact it just locally verified by direct query, not relying on the column's
prior value).

**Alternative considered:** lock the parent row (`SELECT ... FOR UPDATE`)
across the sweep, as the subprocess-return handler does across its
parked-check + advance. Rejected: that lock exists there to protect a
read-then-write of the *parent's own* mutable state (which step it's parked
on). Here the parent's own row never changes during the sweep — only
`cancel_sweep_state`, written unconditionally to a value the writer just
independently confirmed — so there is nothing a lock would protect that the
per-child OCC predicates and the `conflicted` bucket don't already handle.

### Resume branch lives in `cancelInstance`'s existing entry guard, not a new function

```ts
export async function cancelInstance(instance, body, actor = SYSTEM_ACTOR, db = sql, resolveBody?) {
  if (instance.status !== "running") {
    if (instance.status === "cancelled" && resolveBody) {
      const [{ cancel_sweep_state }] = await db`SELECT cancel_sweep_state FROM instances WHERE instance_id = ${instance.instanceId}`;
      if (cancel_sweep_state === "pending") await sweepCancelledChildren(instance.instanceId, actor, db, resolveBody);
    }
    return instance;
  }
  // ...unchanged own-commit path...
  if (resolveBody) await sweepCancelledChildren(instance.instanceId, actor, db, resolveBody);
  return cancelled;
}
```

Both the fresh cancel and the resume path end up calling the same
`sweepCancelledChildren`, so fault isolation and the `'done'` convergence rule
apply identically whether this is the first attempt or a retry — there is
exactly one sweep implementation, not two.

This keeps `cancelInstance` the single public entry point every existing
caller already uses (`transition-execution`'s established "extend the seam,
don't fork it" convention), rather than introducing a `resumeCancelCascade`
sibling function that callers would need to learn to call instead. The
`instance.status !== "running"` guard's *shape* is preserved — it still
short-circuits before doing anything to the instance's own record — it just
gains one conditional branch for the specific case this change targets.

**Alternative considered:** a separate exported `resumeCancelCascade(...)`
function. Rejected — it would need its own no-op semantics duplicated from
`cancelInstance`'s guard, and every caller wanting resumability would need to
know to call *both* functions in sequence (cancel, then maybe resume) instead
of one idempotent entry point that does the right thing regardless of the
instance's current state.

### The instance's own no-op contract is unaffected

The resume branch never calls `commitTransition` for the already-cancelled
instance — it only reads `cancel_sweep_state` and, if `'pending'`, calls
`sweepCancelledChildren`, which mutates *children*, not the parent's own
`HistoryEntry`/`transitionSeq`/`status`. The `cancellation` spec's existing
"Cancelling a non-running instance is a no-op" scenario (no `HistoryEntry`,
`transitionSeq` unchanged) remains true verbatim for the instance itself; the
delta spec adds a new scenario clarifying that the resumed child cascade is
not exempt from — and is not itself covered by — that no-op wording.

## Risks / Trade-offs

- **[Risk]** `cancel_sweep_state` can be left permanently `'pending'` on an
  instance whose sweep keeps hitting a genuine `failed` outcome (e.g. a
  `resolveBody` that will never resolve a deleted process's version) — nothing
  auto-retries forever. → **Mitigation**: this matches `migrateInstances`'
  accepted behavior for its own `failed` bucket; the column is directly
  queryable (`status = 'cancelled' AND cancel_sweep_state = 'pending'`) for an
  operator to find and investigate stuck sweeps, which is strictly better than
  today's silent, undiscoverable strand.
- **[Risk]** A caller that never passes `resolveBody` to `cancelInstance`
  leaves `cancel_sweep_state` at `'pending'` forever after the first commit
  (no sweep is ever attempted), even for an instance with zero children. →
  **Mitigation**: identical to today's documented behavior ("Omit
  `resolveBody` to cancel only this instance"); the column's contract is
  "sweep attempted and clean," not "no children exist," so a `'pending'` row
  with no children is not misleading, only unconfirmed — and any later call
  that does pass `resolveBody` converges it immediately (the query finds zero
  running children, buckets are empty, state flips to `'done'` in that same
  call).
- **[Risk]** Nested multi-level trees need per-level repair (see Non-Goals) —
  an operator fixing a deep failure must find and re-invoke `cancelInstance`
  on the specific node whose own `cancel_sweep_state` is `'pending'`, not just
  the root. → **Mitigation**: the same discovery query
  (`status = 'cancelled' AND cancel_sweep_state = 'pending'`) surfaces every
  such node directly, at any depth, since every node in the tree — not just
  the root the operator originally cancelled — carries its own column.
- **[Risk]** Two concurrent sweeps of the same parent do strictly more DB
  round-trips than one (see "Concurrent sweeps" above) when they race. →
  **Mitigation**: cancellation is not a hot path, and the existing recursive
  design already tolerates this shape of concurrency at the per-child
  `commitTransition` level; no new failure mode is introduced, only bucketed
  more precisely than today's uncaught throw.

## Migration Plan

Additive schema change only: `cancel_sweep_state` is added with
`IF NOT EXISTS` and a `DEFAULT 'idle'`, so existing rows need no backfill —
every currently-`cancelled` instance simply reads as `'idle'` (never
attempted by this new mechanism), which is a true, harmless value: nothing
retries it automatically, but nothing depends on this being `'pending'`/`'done'`
either. Deploy as an ordinary release; rollback is reverting the commit (the
column stays, unread, until the next deploy re-adds the code that reads it —
consistent with how every other `ADD COLUMN IF NOT EXISTS` in this codebase is
treated).

## Open Questions

None.
