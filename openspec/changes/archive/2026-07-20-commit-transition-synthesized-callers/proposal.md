## Why

`commitTransition` is the engine's single commit path for a step entry. It already
serves a synthesized caller — `cancelInstance` supplies an explicit target, an
explicit action list, and `pathId: null` — and the next one (instance migration) is
being designed against it.

It cannot be reused by a caller whose commit is not exactly an authored hop, for
five structural reasons rather than five missing features:

1. **It owns its transaction** (`transition.ts:129`). A caller with side writes that
   must land in the same commit has nowhere to put them.
2. **`status` is a parameter, not derived** (`:82`). Each of the three callers
   re-derives `target.terminal ? "completed" : instance.status` (`:204`, `:300`,
   `:382`). A new caller that forgets silently produces a `running` instance on a
   terminal step, which no other code path can ever complete.
3. **The recorded `version` is hardcoded** to `instance.version` (`:120`, `:111`).
4. **The armed timer set is always computed** from the target step (`:100`).
5. **The written column set is fixed** — a four-deep `jsonb_set` nest (`:136-141`)
   writing `{currentStepId, transitionSeq, status, timers}` and nothing else. A
   caller that must also write the instance's pin or payload cannot.

The consequence is not inconvenience — it is that such callers fork. A fork silently
drops every consequence it does not re-implement, and `commitTransition` has five
that depend on the step being **entered** rather than on how it was entered: the
status derivation, the subprocess spawn, the subprocess return, the action enqueue,
and the appended `HistoryEntry`. Review of the migration design found a fork that
dropped four of them, each producing a permanently stuck instance with no record.

## What Changes

- **Split planning from execution.** A pure-modulo-identifiers function computes the
  next instance state, the `HistoryEntry`, the events, and the outbox rows a step
  entry implies. A second function writes that plan inside a **supplied**
  transaction. `commitTransition` becomes the two composed, opening its own
  transaction as before — so every existing caller is untouched.
- **The applier writes a caller-supplied field patch** alongside its own fixed
  fields, under the same optimistic-concurrency predicate. This forces the
  four-deep `jsonb_set` nest to become a single top-level merge — a real
  restructure of the applier's central statement, not a parameter.
- **The planner accepts caller-supplied events**, so a caller that computes its own
  timer set (and therefore produces no drops of the planner's own) can still record
  what it dropped in the commit transaction.
- **`status` is derived by default** from the target step's `terminal` flag, with an
  explicit override. `cancelInstance` supplies `cancelled`.
- The recorded `version`, the armed timer set, and the subprocess spawn become
  overridable, defaulting to today's behaviour. Spawn suppression exists because the
  spawn is keyed on the transition sequence: an unsuppressed re-entry onto a parked
  subprocess step mints a **different** deterministic child id and creates a
  duplicate child.
- **No behaviour change with nothing supplied.** This is a refactor of a hot path;
  equivalence is the acceptance criterion.

## Capabilities

### New Capabilities

_None._

### Modified Capabilities

- `transition-execution`: the shared commit path exposes a plan/apply split, a
  caller-supplied field patch and event list, and four behaviour overrides — so a
  caller that is not an authored hop reuses it rather than forking it, and every
  consequence of entering a step applies regardless of which caller synthesized the
  entry.
- `timers`: carves out a caller-supplied armed set from "the armed set SHALL replace
  any timers carried from the previous step", which otherwise contradicts the
  override directly.

## Impact

- `src/engine/transition.ts`: `commitTransition` refactored into a planner and a
  transaction-scoped applier, both exported; the row UPDATE restructured from nested
  `jsonb_set` to a single merge. The three call sites drop their `status` derivation;
  `cancelInstance` keeps its explicit override. Module and function docstrings
  updated — `commitTransition`'s currently names the removed `status` parameter.
- No schema change, no new dependency, no change to the outbox, the timers, or the
  resolution worker.
- `test/transition.test.ts`, `test/cancel.runtime.test.ts`: equivalence and the new
  surface.

## Ordering

Implement **after** `harden-subprocess-return`. That change edits
`transition.ts:165-173` — the return-action config — which this change moves into
the planner. Doing the small edit first means the block is touched once and this
change's line references stay accurate.

## Note

Extracted from `add-instance-migration`. Two successive drafts of that change made
incorrect claims about what reusing this function would inherit, because the
inheritance is not a property the function currently has. A third draft of *this*
change declared its option surface closed at four options while the consuming change
required two more — the surface below is what migration actually needs, verified
against its task list rather than anticipated.
