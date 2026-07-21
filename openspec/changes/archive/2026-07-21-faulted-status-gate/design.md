## Context

`faulted` is documented as a dead-end error park (action-handlers spec: "Only a
`running` instance accepts a writeback. A `faulted` instance is a dead-end
error park") and `cancelInstance` already enforces that — `if (instance.status
!== "running") return instance;` before doing anything. `executeManualTransition`
and `fireTimer` have no equivalent guard. Because `markFaulted`
(`src/engine/transition.ts:456-459`) flips `status` without bumping
`transitionSeq`, the shared commit's OCC predicate (`instance_id +
transition_seq`, `applyStepEntry`, `transition.ts:288`) does not notice the
fault — a manual or timer transition computed from the instance's
pre-fault-but-still-current `transitionSeq` still commits.

Two other status-checked paths already establish the pattern this change
follows:
- `cancelInstance`: no-op (return the unchanged instance) on any non-`running`
  status.
- `drainResolutions` / `subprocess.ts`'s internal `resolveAutomatic` calls:
  filtered to `running` at the SQL level before `resolveAutomatic` ever runs.

`resolveAutomatic` itself is reachable from `executeManualTransition`,
`fireTimer`'s transition branch, `startInstance` (always a freshly-created,
necessarily-running instance), and the two callers above (already
status-filtered). Gating the two ungated entry points before they call
`commitTransition` or `resolveAutomatic` closes every path reachable from a
manual or timer trigger — this change's scope per the proposal.

One further, unguarded call exists: `subprocess.ts`'s spawn handler calls
`resolveAutomatic(child, ...)` unconditionally on the newly-created (or
redelivered-and-already-existing) child, with no status check, specifically
so a crashed prior delivery's drive-to-rest resumes on redelivery. If that
drive-to-rest cascade-loops and faults the child, `AutomaticCascadeLoop`
propagates out of the handler as a transient failure and the outbox retries
delivery — re-invoking `resolveAutomatic` on the now-faulted child, unguarded.
This is a distinct gap in the subprocess spawn/redelivery path, not in the
manual/timer transition entry points this change addresses, and is left for a
separate change.

## Goals / Non-Goals

**Goals:**
- `executeManualTransition` and `fireTimer` (both the transition-timer and the
  reminder-timer branch) treat a non-`running` instance — `faulted` in
  particular — as a no-op, symmetric with `cancelInstance`.
- The guard runs before any commit, any outbox enqueue, and before
  `resolveAutomatic` is invoked on the result, so a faulted instance parked on
  an all-automatic step cannot be cascaded either.
- Close test gap #5 from the review: a faulted-status-gating test in both
  directions (manual, timer).

**Non-Goals:**
- No change to `markFaulted`, `cancelInstance`, `resolveAutomatic`, or the OCC
  predicate itself. Bumping `transitionSeq` on fault was considered (see
  Decisions) and rejected for this change.
- No new error type and no throwing behavior — this mirrors `cancelInstance`'s
  no-op, not `executeManualTransition`'s existing `throw`-on-invalid-input
  style (see Decisions).
- Does not address the other liveness findings (#3-#6) or the reminder-timer's
  dangling `resolve_state='pending'` minor finding — separate changes.

## Decisions

**No-op, not throw.** `executeManualTransition` currently throws on caller
errors (`GuardRefused`, "not a manual path", "path not on current step") —
all cases where the *request* is malformed against the *current* definition.
A non-`running` instance is different in kind: the request may have been
perfectly valid when the caller computed it, and the instance simply moved
(or faulted) concurrently. That is exactly the shape `cancelInstance` already
handles as a silent no-op, and `fireTimer` itself already no-ops today when
the named timer isn't on the current step ("not on the current step (instance
moved): no-op") — an instance-moved-concurrently case, not a caller error.
Matching that existing convention keeps the two entry points consistent with
each other and avoids introducing a new error class a caller must special-case
alongside `ConcurrencyConflict`.

**Guard placed before `commitTransition`, not inside it.** The shared
`commitTransition`/`applyStepEntry` seam (per `transition-execution` spec) is
used by callers that intentionally act on specific statuses — `cancelInstance`
overrides status to `cancelled`, migration commits `pending`/faulted-adjacent
states. Pushing a blanket "must be running" check into the shared seam would
either break those callers or require a bypass flag, both worse than a
two-line guard at the top of each of the two call sites that don't already
have one.

**Not bumping `transitionSeq` in `markFaulted`.** Considered as an
alternative fix (it would make the existing OCC predicate reject stale
commits without any new status check). Rejected: it's a larger-blast-radius
change to `markFaulted`'s documented "a status flip, not a transition — no seq
bump and no HistoryEntry" behavior, referenced by other specs
(instance-migration's untouched-if-faulted rule keys off status, not seq), and
would still leave a caller that re-reads the instance fresh (getting the new
seq) with no explicit signal about *why* its transition was refused. An
explicit status check is more direct and is the same shape the rest of the
engine already uses.

## Risks / Trade-offs

[A caller silently getting no-op'd may not notice a faulted instance stopped
progressing] → This matches `cancelInstance`'s existing no-op contract, which
callers must already handle; no new risk class introduced. A caller wanting to
distinguish "no-op because faulted" from "no-op because already there" can
still read the instance's `status` from the return value.

[Reminder-timer branch also enqueues actions today without a status check,
which is subtly different from the transition branch] → In scope: gating it
the same way is a one-line addition at the same call site and is required to
close test gap #5's "in either direction" for timers.
