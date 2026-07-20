## Why

The runtime record has exactly one shape: `HistoryEntry`, which is transition-shaped
— `toStepId` is required, `fromStepId` and `pathId` describe the hop. Three real
events carry no step change and therefore have nowhere to go:

- **A reminder-timer fire.** It enqueues its actions and marks the timer `fired`
  without moving the instance or bumping `transitionSeq`. Worse than invisible: the
  outbox attaches each `ActionOutcome` to a history entry by
  `(instance_id, transition_seq)` (`src/engine/outbox.ts:84`), so a reminder's action
  outcomes land on the entry of the transition that *entered* the step, mixed in with
  that transition's own actions and attributable to neither.

  On a step an instance was **created** on, it is not misfiling but total loss.
  `createInstance` writes no history entry and the instance rests at sequence 0, so
  the update matches no row, raises nothing, and the outcome is discarded. Verified
  against a running engine: an initial wait-state with a reminder timer reports
  `delivered: 1` and zero `ActionOutcome`s recorded anywhere. A delivery that
  succeeded leaves no audit trace at all.
- **A timer that could not be armed.** `add-deadline-timers` shipped with a
  documented hole: a deadline that yields no instant at entry is dropped silently —
  no history entry, no dead-letter, no log (the engine has no logging at all). On an
  all-automatic wait-state whose only bound is that timer, the instance hangs until
  someone cancels it, and nothing signals that anyone should.
- **A version migration.** It rewrites an instance's pin without a hop. Migration is
  not built yet, but its audit need is the same one, and it is the reason to solve
  this generically now rather than bolting a flag onto `TimerState`.

The narrow fix considered earlier — an `unarmed` marker on `TimerState` — was
rejected on inspection: it serves one of the three, and the migration change would
have had to touch the contract a second time to reach the same place.

## What Changes

- A new append-only runtime record, `InstanceEvent`, sibling to `HistoryEntry` in
  `src/schema/definition.ts`. It records what happened, to which instance, at which
  `transitionSeq` (the seq in force — an event never advances it), under which
  definition `version`, with a kind-specific payload.
- Two event kinds ship, each with an emitter and a rejecting test:
  `timer.fired` (a reminder fired: actions enqueued, no transition) and
  `timer.unarmed` (a declared timer produced no `fireAt` at entry, with a reason).
  Migration adds its own kind additively when it lands — the record shape is what
  this change establishes.
- `armStepTimers` becomes able to report what it dropped. Arming stays total: a
  deadline that raises or yields a non-instant still omits the timer and still does
  not fail the entry — it is now recorded instead of vanishing.
- An `ActionOutcome` can attach to an `InstanceEvent` instead of a `HistoryEntry`,
  so a reminder's action results are attributable to the fire that caused them.
- `TimerState` is unchanged. It keeps meaning "armed timers"; a timer that never
  armed is an event, not a mutated timer record.

## Capabilities

### New Capabilities
- `runtime-events`: the `InstanceEvent` record — its shape, its append-only and
  ordering guarantees, its relationship to `HistoryEntry`, and the rule that an
  event never advances `transitionSeq`.

### Modified Capabilities
- `timers`: a reminder fire emits a `timer.fired` event; a timer that cannot be
  armed emits `timer.unarmed` rather than being dropped silently. The existing
  arming requirement's "is omitted from the armed set" clauses gain the recording
  obligation.
- `action-handlers`: "Each delivered action records an ActionOutcome" currently
  requires the append to go to "the entry whose `transitionSeq` equals the outbox
  row's `transition_seq`". That derivation is what misfiles and loses outcomes; the
  enqueuing record is carried on the row instead.

## Impact

- `src/schema/definition.ts`: the `InstanceEvent` record and its id brand. This is
  the contract — changed deliberately, with a rejecting test per invariant.
- `src/engine/store.ts`: an `instance_events` table and its DDL.
- `src/engine/duration.ts` / `src/engine/transition.ts` / `src/engine/store.ts`:
  arming reports dropped timers; the two arming call sites persist them in the same
  commit as the entry.
- `src/engine/transition.ts` (`fireTimer`, reminder branch): emit `timer.fired` and
  correlate the enqueued actions to it.
- `src/engine/outbox.ts`: route an `ActionOutcome` to an event when the row names
  one, to a history entry otherwise.
- `test/`: emission, ordering, the outcome-routing regression, and that arming is
  still total.
- No API or migration impact. A pre-existing instance simply has no events.
