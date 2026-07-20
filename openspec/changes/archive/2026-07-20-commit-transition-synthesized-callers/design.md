## Context

`commitTransition` (`src/engine/transition.ts:75-177`) computes the post-entry
instance and its records, decides the consequences of entering the target step, and
executes all of it in a transaction it opens itself.

Its consequences, and what each is keyed on:

| Consequence | Line | Keyed on |
|---|---|---|
| `transitionSeq + 1` | `:86` | the instance |
| armed timers + `drops` | `:100` | the **target step** |
| `next_timer_at` | `:101, :143` | the armed set |
| `HistoryEntry` (incl. `version`) | `:116-127` | the instance, the target |
| OCC predicate | `:144` | the observed seq |
| `timer.unarmed` events | `:107-115` | the drops |
| ordered actions → outbox | `:150-153` | the caller's list |
| `core.spawnSubprocess` | `:158-162` | the **target's type** |
| `core.returnSubprocess` | `:165-173` | the **target's terminal** + `instance.parent` |
| `status` | *at each caller* | the **target's terminal** |

Eight of ten are already keyed on the step being entered. `status` is the outlier: a
parameter (`:82`) that all three callers derive identically — a shared consequence
implemented three times.

`cancelInstance` (`:224`) proves the synthesized shape works, and is also why
`status` cannot simply be derived and the parameter removed: cancel commits
`cancelled`, which no step property implies.

## Goals / Non-Goals

**Goals:**

- Make every consequence of entering a step apply to any caller that commits a step
  entry, without that caller re-implementing any of them.
- Let a caller extend the commit's transaction and its written field set.
- Keep the surface exactly as large as the known consumer requires — verified
  against that consumer's task list, not anticipated.
- Change nothing observable when nothing is supplied.

**Non-Goals:**

- Changing what a transition means, the trigger order, the OCC rule, or the outbox
  contract.
- Introducing a caller. This ships the seam and the existing callers.
- Covering `createInstance`, which is a **second** step-entry commit path
  (`store.ts:142-217`: it arms timers, derives `minFireAt`, writes drops) and does
  not route through here. It notably does not spawn for a subprocess `initialStep` —
  the gap CLAUDE.md already records. Unifying the two is out of scope; the
  requirements below are scoped to transitions accordingly.

## Decisions

### Split planning from execution

```
planStepEntry(instance, target, body, opts) -> StepEntryPlan   // no I/O
applyStepEntry(tx, plan, extraFields?)                          // writes, no tx of its own
commitTransition(...)  =  db.begin(tx => applyStepEntry(tx, planStepEntry(...)))
```

`opts` carries what the current parameter list carries plus the overrides:
`pathId`, `cause`, `actorId`, `actions`, and `status?`, `timers?`,
`entryVersion?`, `suppressSpawn?`, `events?`. That is nine members, not four
options — the earlier framing was wrong and is corrected here. `pathId`, `cause`,
`actorId` and `actions` are not optional extras; without them `:116-127` and
`:150-153` are unconstructible.

`at` is deliberately **not** among them: the planner reads the clock once itself (see
the next decision). An earlier draft listed it here, which contradicted that.

*Why a split rather than an optional `tx`:* an optional `tx` solves the transaction
problem alone. The planner being separate is what makes the step-entry consequences
inspectable and testable without a datastore, and gives a caller a place to see the
plan before applying it.

### The planner is pure modulo identifiers and the clock, and is partial

It mints `crypto.randomUUID()` for the `HistoryEntry` id (`:117`) and for each event
id (`:108` via `store.ts:107`), and reads the clock once (`:87`). It is therefore not
a pure function, and the tests cannot compare plans by value without masking
`entry.id`, `events[].id`, and `at`.

It is also **partial**: `armStepTimers` raises on the duration-width assertion
(`duration.ts:149-152`). Behaviour is unchanged — that throw already happens before
`db.begin` today — but a caller supplying its own timers calls `armStepTimers`
itself and inherits the throw outside the planner.

*Why not inject `{ now, newId }`:* it would make the planner genuinely pure and the
tests exact. Rejected as scope: the ids are already minted before `db.begin` today,
so the plan carries exactly what will be written, and replanning after a failure is
safe — a rolled-back transaction left `transitionSeq` unchanged so the replan
commits once with fresh ids, and a committed one makes the replan lose on the OCC
before any insert. The outbox keys, which *would* collide, are deterministic
(`idempotency.ts:28`) and the OCC fires first.

### The applier writes a caller-supplied field patch

`applyStepEntry` takes an optional patch merged into the instance row alongside its
own fixed fields, under the same OCC predicate.

*This forces a restructure, not a parameter.* `:136-141` is a fixed four-deep
`jsonb_set` nest; dynamic nesting through Bun.sql tagged templates is impractical.
The realistic form is one top-level merge folding the fixed keys and the patch
together. Naming this here because "the applier only writes" understates it.

*The disjointness comment at `:130-135` becomes conditional.* Its reasoning is that
this path never touches `{data}`, so it and the post-commit writeback — which
`jsonb_set`s a disjoint `{data,<fieldId>}` path — are serialized by the row lock
with no lost write. A caller that patches `data` wholesale breaks that: the writeback
does **not** advance or check `transitionSeq` (`outbox.ts:174-178`), so the OCC
predicate does not see it and a wholesale write computed from an earlier read erases
it silently. The comment must be updated to state the condition, and any caller
patching `data` must hold the row (`SELECT … FOR UPDATE`) across its read and its
commit. That obligation belongs to the caller and is stated in the requirement.

### The planner accepts caller-supplied events

A caller supplying `opts.timers` produces no drops of the planner's own, but may have
computed its own drops while deriving that set. `opts.events` appends to the plan's
event list so they land in the commit transaction.

Without it a caller can only hand-mutate the returned plan, which contradicts the
plan being what the planner computed.

### `status` is derived, with an override

`target.terminal ? "completed" : instance.status`, overridable. Only `cancelInstance`
overrides.

*Why this is the important one:* it is the only consequence living at the callers, so
the only one a new caller can miss without a signal. Missing it produces a `running`
instance on a terminal step — a state no other path produces and none can resolve,
since terminal steps have no outgoing paths (`definition.ts:402`) and this path is the
only writer of `completed`.

*Pre-existing behaviour preserved:* `markFaulted` (`:310-313`) sets `faulted` without
advancing the seq, so a later transition carries `faulted` forward or upgrades it to
`completed` on a terminal target. Identical before and after.

### Spawn suppression, and why the return needs none

`opts.suppressSpawn` omits the `core.spawnSubprocess` enqueue. The spawn's
idempotency is keyed on the transition sequence — the child id is
`uuidv5(parentId | seq | stepId)` (`idempotency.ts:38`) and the handler's guard is a
lookup on that id (`subprocess.ts:57`) — so a commit re-entering a parked subprocess
step advances the sequence, derives a **different** child id, misses the guard, and
creates a second child alongside the live one.

*Not inferred from `currentStepId === target.id`:* an authored self-loop is a real
re-entry that must spawn. Whether a re-entry is genuine is the caller's knowledge.

The return (`:165-173`) needs no equivalent, but **not** because its key is
sequence-free — it is `idempotencyKey(instanceId, nextSeq, ret.id)`, exactly like the
spawn. It needs none because entering a terminal step derives `completed`, and no
path transitions a non-running instance, so an instance reaches a terminal step at
most once. The safety is a three-part chain — status derivation, terminal-only
enqueue, and callers not committing from a terminal step — and `opts.status` can
break it: `cancelInstance` already enters a terminal step with a non-`completed`
status, and consequently a cancelled child *does* enqueue a return (harmless today
only because downward propagation leaves the parent non-running). This invariant is
recorded as a requirement, not left in a task.

## Risks / Trade-offs

- **Refactoring the hot path of every transition, including its central SQL** →
  Equivalence is the acceptance criterion: the full suite passes unchanged before any
  new surface is exercised, and the nothing-supplied path produces identical writes.
  The main risk of the change and the reason it lands alone.
- **`applyStepEntry` takes a `tx` and cannot open one** → A caller that forgets loses
  atomicity silently. Mitigated by the type and by `commitTransition` remaining the
  ordinary entry point.
- **A caller can supply a timer set inconsistent with the target step** → The point.
  The planner still derives the scheduling column from whatever set it is given.
- **A caller patching `data` can lose a concurrent writeback** → Real, and not
  preventable at this layer; the caller must hold the row lock. Stated in the
  requirement rather than left to be discovered.
- **`suppressSpawn` and `extraFields` ship without an in-repo consumer** → Exercised
  by direct tests. Adding them inside the change that first needs them is what
  produced the defects they exist to prevent.

## Open Questions

- **Should `cancelInstance` move to the plan/apply seam?** It has no side writes, so
  `commitTransition` still fits. Left as-is.
- **Should the planner own the run-to-rest cascade?** No — the cascade commits further
  transitions, so it cannot live inside one commit's plan.
- **Should `createInstance` be unified with the planner?** It duplicates the arming
  and drop-recording logic and misses the spawn consequence. Out of scope; noted so
  the divergence is deliberate.
