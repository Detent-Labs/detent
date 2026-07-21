## Context

`makeSpawnHandler` (`src/engine/subprocess.ts:50-107`) does four things in sequence
on a fresh delivery: (1) skip if the child already exists, (2) create the child
(resolve parent/body/spec, seed `inputMapping`, `createInstance`), (3) drive the
child to rest (`resolveAutomatic`), (4) self-cancel the child if the parent was
cancelled mid-spawn (the "cancel/spawn race backstop"). The existence check at
step 1 is meant to make step 2 idempotent — at-least-once dispatch may call this
handler more than once for the same spawn — but it currently returns early for
*all four* steps, not just step 2. Steps 3 and 4 are exactly the repairs a
redelivery needs to complete if the first attempt crashed after `createInstance`
but before reaching them.

This is a single-file fix. It changes control flow inside one handler; it does
not touch the schema, the outbox contract, `returnSubprocess`, or any other
caller.

## Goals / Non-Goals

**Goals:**
- Every delivery of `core.spawnSubprocess` — first or redelivered — reaches and
  executes the drive-to-rest and cancel-orphan-backstop steps.
- No behavior change for the already-correct fresh-delivery path.
- No new idempotency bookkeeping: reuse the fact that `resolveAutomatic` and
  `cancelInstance` are already safe to call more than once.

**Non-Goals:**
- No new `InstanceEvent` kind for this. The repairs becoming reliably idempotent
  removes the silent-strand failure mode; there is nothing left to report.
- No change to how the child id is derived, how the parent-running check gates
  *creation*, or to `returnSubprocess`.
- Not addressing the broader "commit-then-cascade has no durable resume flag"
  finding (review item #4) — that is a separate, larger change (a `resolve_state`
  column analogous to migration's). This change closes the redelivery-specific
  gap without it, because the outbox's own at-least-once redelivery is already
  the retry mechanism here; it was just being short-circuited.

## Decisions

**Move the existence check so it only guards creation, not the whole handler
body.** Concretely: branch into "child exists" vs. "child does not exist" only
for the *creation* half (parent-running check, child body resolution, input
mapping, `createInstance`), producing a `(child, childBody)` pair either way —
by loading the row when it already exists, by creating it when it does not.
The rest of the handler (drive-to-rest, backstop) runs unconditionally on that
pair, once, regardless of which branch produced it.

Alternative considered: leave the early return in place and rely on a separate
sweep/reconciliation pass to catch stranded children later. Rejected — the
outbox already redelivers this exact action at-least-once; a second sweep
mechanism would duplicate that machinery to work around a bug in how the first
one is used, rather than fixing the use.

**On the "child exists" branch, resolve `childBody` from the loaded child's own
`{processId, version}`, not by re-deriving the parent's subprocess spec.** The
fresh-creation branch resolves the child body via the parent's `versionBinding`/
`spec` before the child exists; once the child row exists, its own pinned
`{processId, version}` is authoritative and cheaper to use directly (one
`resolveBody` call, no parent load, no `resolveLatestByContract` call — the
child is already bound). Re-deriving from the parent's current spec would also
be wrong if the parent's definition changed between the original spawn and this
redelivery (unlikely given definitions are immutable, but the child's own pin is
the correct source of truth regardless).

An unresolved `childBody` on this branch (the definition row is gone or
unreadable) MUST throw, exactly as the fresh-creation branch already throws on
an unresolved `parentBody`/`childBody` (`subprocess.ts:68,83`). Passing
`undefined` silently into `resolveAutomatic` would fail later with a confusing
type error instead of a clear one at the point the real problem is — and would
do so only on the redelivery path, making it harder to reproduce than the
fresh-path equivalent.

**No new idempotency guard around `resolveAutomatic` or `cancelInstance`.** Both
are already idempotent for this use:
- `resolveAutomatic` reads the child's *current* step from the row passed in; if
  the child already advanced (via a prior partial delivery) it starts from
  wherever it actually is, so re-invoking it after the child has already reached
  a terminal step or a wait-state is a no-op (`step.terminal || !allAutomatic`
  returns immediately). If the child in fact has not advanced yet, it advances it
  exactly as the first delivery would have.
- The cancel-orphan backstop only acts when a fresh load shows the parent
  non-running and the child still `running`; calling it again after the child
  is already terminal or already cancelled is a no-op by its own guards.

This means the fix is purely about reaching the calls, not about making them
safe to repeat — they already are.

**Ordering stays identical to the fresh path.** Drive-to-rest runs before the
backstop check in both branches, matching the existing fresh-delivery order (a
child that reaches terminal during drive-to-rest is no longer `running`, so it
is not a candidate for self-cancellation — same as today).

## Risks / Trade-offs

- **Re-running `resolveAutomatic` against the child's current live state costs a
  guard re-evaluation on every redelivery**, even harmless ones (retry after a
  transient network blip with no crash in between). This is unavoidable given
  the goal (redelivery must reach the repair) and cheap (one row read plus guard
  evaluation over already-resolved data); it is the same cost the fresh path
  always paid.
- **The "child exists" branch no longer checks the parent's running status
  before proceeding** (that check was only ever relevant to gating creation).
  This is intentional and matches the fresh path's own behavior: the backstop,
  not a pre-check, is what reconciles a parent cancelled mid-spawn, on both
  branches now uniformly.
- **Two overlapping deliveries of the same spawn (not sequential crash-then-retry,
  but genuinely concurrent — a stale-claim reclaim while the original worker is
  still alive and mid-handler) can race inside `resolveAutomatic`.** One
  delivery's `commitTransition` wins a hop; the other's `applyStepEntry` sees a
  zero-row update on the OCC predicate and throws `ConcurrencyConflict`
  (`transition.ts:49-54,266`), not a silent no-op. This is not a new failure
  class introduced by this change — it is the same OCC contention every
  automatic cascade in the engine already accepts (e.g. a cancel racing a
  transition, per `CLAUDE.md`'s "resolves to one winner") — and it is already
  bounded by the outbox's generic retry policy: any thrown error is retried with
  backoff up to `MAX_ATTEMPTS` before dead-lettering (`outbox.ts:21,184-194`), and
  the losing delivery's next attempt reads the now-advanced child fresh and
  no-ops correctly. Before this change the "child exists" branch never called
  `resolveAutomatic` at all, so this race window did not exist on redelivery;
  after this change it does, but only under the same lease-expiry-while-alive
  condition every other outbox-dispatched cascade already tolerates. No
  mitigation beyond the existing retry policy is proposed.
