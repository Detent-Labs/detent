## Why

The contract has carried `Timer.deadline` since the schema landed — a timer whose
fire time is an absolute instant derived from process data (an SLA date, a
statutory due date, a customer-committed delivery date) rather than a fixed
offset from step entry. It is schema-valid and authoring-validated today, but the
engine silently skips it: `armStepTimers` filters to `duration` timers only. An
author can publish a definition with a deadline timer and get no error and no
timer. Closing this is the last piece of the first-class-timer promise and the
smallest remaining engine gap before migration.

## What Changes

- `armStepTimers` arms `deadline` timers at step entry: it evaluates the
  deadline's CEL expression against the entry-time guard context and uses the
  resulting ISO-8601 instant as the timer's `fireAt`. Signature changes to accept
  the `ProcessBody` and the entering instance state (needed for the CEL context).
- `src/cel/check.ts` stops registering the `child` namespace for a `deadline`
  site. A deadline is evaluated at step *entry*, before any child instance exists,
  so `child.*` can never resolve there; today such a deadline type-checks at
  publish and would silently never arm. **BREAKING** for a body that references
  `child` in a deadline — but such a body is already non-functional, and the
  existing `cel-expressions` spec already scopes `child` to a subprocess step's
  *guards*, so this aligns the code with the stated contract.
- A deadline whose expression is unresolvable at entry (a field not yet written)
  or does not yield a parseable instant is **not armed** — the same totality rule
  guards already follow, so a data-dependent deadline cannot wedge a transition.
- A deadline already in the past at entry is armed with that past `fireAt` and
  fires on the next scheduler poll, matching the existing overdue-after-restart
  behaviour.
- Deadline instants are normalized to UTC ISO-8601, so `fireAt` stays lexically
  sortable and `minFireAt` / the `next_timer_at` scheduler need no change.
- Once armed, a deadline timer is indistinguishable from a duration timer: the
  same `TimerState`, the same fire-once OCC, the same transition/reminder
  semantics. No change to firing.
- No schema change. `Timer.deadline` and the `duration` XOR `deadline`
  refinement are already correct; this change only makes the engine honour them.

## Capabilities

### New Capabilities
<!-- none: this completes an existing capability rather than introducing one -->

### Modified Capabilities
- `timers`: the "Arm timers on step entry" requirement currently states that
  `deadline` timers are out of scope for v1 and are not armed. That exclusion is
  removed and replaced by requirements covering deadline evaluation at entry,
  the unresolvable/unparseable non-arming rule, and past-deadline behaviour.
- `cel-expressions`: the "Formal expression context" requirement scopes `child` to
  a subprocess step's guards. It gains an explicit statement that a timer
  `deadline` is outside that scope even on a subprocess step, because it is
  evaluated at entry.

## Impact

- `src/engine/duration.ts`: `armStepTimers` gains the body + instance parameters
  and a deadline branch; a new ISO-8601 instant parse/normalize helper.
- `src/engine/transition.ts` (`commitTransition`) and `src/engine/store.ts`
  (`createInstance`): the two arming call sites pass the new arguments. Both
  already hold the body and the entering data.
- `src/cel/eval.ts`: reuses `buildGuardContext` unchanged; a deadline is evaluated
  in guard scope (no `result`, no `child`).
- `src/cel/check.ts`: the deadline site withholds `child` and data sources and
  declares an expected result type of `string`; `Site` gains `dataSources` and
  `expect`, and `buildEnv`/`envFor` thread the former. Each with a rejecting test.
- `test/duration.test.ts` (instant parsing), `test/timer.test.ts` (arming,
  non-arming, past-deadline, firing end-to-end), `test/cel.test.ts` (the three
  publish-time deadline rules).
- No dependency, database, or migration impact.

**Breaking summary.** Three publish-validation tightenings ship, each rejecting a
body that previously validated. All three only reject bodies that were already
non-functional — their timer could never have armed — so no working definition
breaks:
1. `child` in a deadline (no child exists at entry);
2. a data-source reference in a deadline (`buildGuardContext` resolves none, so it
   would raise at every arming, for every instance, permanently);
3. a deadline whose expression does not infer to `string` or `dyn`.
