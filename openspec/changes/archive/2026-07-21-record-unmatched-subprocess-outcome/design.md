## Context

`core.returnSubprocess` (`src/engine/subprocess.ts`) is the outbox handler
delivered when a subprocess child reaches a terminal step. Inside one
transaction holding the parent's row it: locks and re-checks the parent is
still parked at the linked subprocess step, evaluates the step's
`outputMapping` over `child.outcome`/`child.data` and writes the patch into
the parent's `data`, then selects the first automatic path whose guard
matches `child.outcome` and commits that hop directly (`selectAutomaticPath`
+ `executeAutomaticTransition`, lines 200-203).

If `selectAutomaticPath` returns nothing, line 201 returns `null` and the
transaction commits anyway — the writeback is real, but no path was taken.
The outer caller marks the outbox row delivered regardless (`makeReturnHandler`
always resolves `{}`). Because the `child` namespace is scoped to this one
delivery (`buildGuardContext` + the ad-hoc `child` object are local to the
handler invocation), there is no mechanism — not the timer scheduler, not the
writeback-reresolution worker, not a redelivery (the row is already
`delivered`) — that will ever recompute `child.outcome` and retry the match.
The parent is stuck on its subprocess step permanently, and nothing in
`history_entries` or `instance_events` says why.

This is structurally identical to the problem `timer.unarmed` already solved:
a total operation (arming timers; here, applying a child's return) that must
never fail the entry/delivery, paired with a possible outcome (a dropped
timer; here, an unmatched guard) that silently loses information. The
established fix is an `InstanceEvent`, not a behavior change — the operation
stays total, but the loss becomes queryable.

## Goals / Non-Goals

**Goals:**
- Make an unmatched `child.outcome` observable in the runtime record, at the
  exact moment and in the exact transaction where the engine currently
  discovers and discards that fact.
- Follow the established `InstanceEvent` conventions exactly (envelope shape,
  "actions enqueued or not" carrying, transactional co-location, additive
  union member) so this doesn't introduce a second pattern for the same kind
  of fact.
- Cover the specific trigger the review calls out as trivially reachable: an
  independently cancelled child, whose return carries the reserved
  `"cancelled"` outcome, against a subprocess step whose paths don't guard
  for it.

**Non-Goals:**
- Recovering the stranded parent automatically. There is no correct
  automatic action to take on behalf of an author who didn't declare a path
  for this outcome — recording the fact is the same posture `timer.unarmed`
  takes (queryable, not self-healing).
- A publish-time lint for outcome coverage (contract outcomes ⊆ guarded
  outcomes, or a bounding timer present). The review marks this "ideally,"
  secondary to the event. It's a meaningfully separate piece of work (a new
  publish-time check in `compile.ts`/`definitions.ts`, cross-referencing
  `contract.outcomes` against the parent's path guards, which needs its own
  design for how to statically evaluate "does this guard cover this
  outcome") and is left as a follow-up finding rather than folded in here.
- Any change to the currently-uncommitted `resolve_state`/durable-resume work
  in the working tree (finding #4). That work is orthogonal: it durably
  resumes a cascade that a crash interrupted mid-flight. This change concerns
  a cascade that completed exactly as designed and simply had no matching
  path — resuming it later would compute the same "no match" result again.
- Changing the shipped examples (`examples/*.json`). The review notes they
  don't guard the `"cancelled"` outcome; fixing that is example content, not
  engine behavior, and is out of scope for a runtime-events change.

## Decisions

**Event kind name: `subprocess.outcome-unmatched`.**
Mirrors the existing `subprocess.spawn-enqueued` prefix (this event also
originates in `subprocess.ts`) and reads as a fact about the outcome, not
about the return delivery mechanics — matching `timer.unarmed` naming a fact
about the timer, not the arming mechanics.

Alternative considered: `subprocess.return-unmatched`. Rejected — "return"
names the action/delivery, and every other kind names the *thing* that
happened to a domain object (a timer, a spawn), not the handler that
observed it.

**Payload: `{ stepId: StepId, outcome: string | null }`.**
`stepId` is the parent's subprocess step (the one the parent is stuck on),
following `timer.unarmed`'s and `subprocess.spawn-enqueued`'s precedent of
naming the step/timer id so the fact resolves against the `version` the
envelope carries. `outcome` is nullable to match the existing
`childOutcome: string | null` shape already threaded through
`RETURN_ACTION_TYPE`'s config (`target.outcome ?? null` at
`transition.ts:236`) — a terminal step's `outcome` is `z.string().optional()`
on the schema, so an uncontracted process can reach here with no outcome at
all.

Alternative considered: also carry `child.data` or the evaluated
`outputMapping` patch. Rejected — the patch already landed in the parent's
`data` (that part of the writeback succeeds regardless of path-matching), so
it's inspectable there; duplicating it into the event payload is redundant
and the other three kinds keep their payloads minimal (id + reason shape).

**No `actions` field.**
Unlike `timer.fired` and `subprocess.spawn-enqueued`, this event enqueues
nothing — no automatic path means no transition means no trigger actions.
This matches `timer.unarmed` and `migration.skipped`, the two existing kinds
that also enqueue nothing and correspondingly omit the field (per the
union's own comment: "the field would be permanently null on that arm and
would invite a reader to expect outcomes that cannot exist").

**Sequence and version: the parent's current, unchanged values.**
No transition occurs, so `transitionSeq` is recorded, not advanced — the
same rule every event kind follows. `version` is the parent's version (the
`stepId` in the payload resolves against it), read from the same locked
`parent` row already in scope at the call site.

**Where it's recorded: inside the existing transaction, right after the
`if (!path) return null` check, before returning.**
The transaction already holds the parent row and has already committed the
writeback UPDATE (line 188-191) by the time path-selection runs, so the
event append joins that same commit — satisfying "same transaction as the
state change" even though, in this one case, "the state change" is the
writeback succeeding while the *cascade* is what didn't happen. Using
`appendInstanceEvent(tx, event)` (`store.ts`), the same primitive every other
emitter uses, keeps this consistent with the rest of the codebase rather than
inventing a parallel write path.

## Risks / Trade-offs

**[Risk] A subprocess step legitimately parked (not stranded) could look
identical to a stranded one from outside this handler.** A parent might
still be mid-cascade for unrelated reasons. → Not a concern here: this event
fires only from inside `makeReturnHandler`'s own `if (!path) return null`,
which is specifically "the return was delivered, the writeback applied, and
no automatic path matched" — it cannot fire for any other reason, so its
presence is an unambiguous signal.

**[Risk] Recording an event on every unmatched delivery, including one a
future publish-time lint would prevent, means the event stays reachable even
after that lint ships.** → Intentional and consistent with `timer.unarmed`:
a publish-time check narrows *authored* definitions but never protects an
instance running under a definition published before the check existed. The
event stays the durable safety net regardless of what static checking is
added later.

**[Risk] `child.outcome === "cancelled"` (the reserved cancel outcome) is
the single most likely trigger, per the review, and both shipped examples
would emit this event today if exercised.** → No production code risk — this
is exactly the gap the change closes. Flagged here only so the task list
includes a test exercising that specific path, not just a synthetic
custom-contract case.

## Migration Plan

Additive only: a new discriminated-union member and one new call site inside
an existing transaction. No table/column change (`instance_events` already
stores arbitrary `event jsonb` keyed by `kind`). No backward-incompatible
change to `RETURN_ACTION_TYPE`'s config or to the outbox delivery contract —
rows are still marked delivered the same way. Deploys as an ordinary code
change; nothing to roll forward or back beyond the usual revert.
