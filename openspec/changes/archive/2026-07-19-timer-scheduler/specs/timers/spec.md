## ADDED Requirements

### Requirement: Arm timers on step entry

When an instance enters a step that declares `duration` timers, the engine SHALL
compute a `fireAt` timestamp for each and persist it into `instance.timers[]` as
part of the same commit that records the entry. A `duration` timer's `fireAt` is
the entry instant plus the ISO-8601 duration. The armed set SHALL replace any
timers carried from the previous step. `deadline` timers are out of scope for v1
and are not armed (the schema and authoring-time validation still carry them).

#### Scenario: Duration timer armed at entry
- **WHEN** an instance transitions onto a step carrying a `duration: "P1D"` timer
- **THEN** `instance.timers[]` contains that timer with `fireAt` equal to the
  entry time plus one day, and `fired` unset

#### Scenario: Step without timers arms nothing
- **WHEN** an instance enters a step that declares no timers
- **THEN** `instance.timers[]` is empty after the entry commit

### Requirement: Disarm timers on step exit

When an instance leaves a step, timers armed for that step SHALL no longer be
eligible to fire. A timer that has not fired by the time its step is exited is
discarded, not carried forward.

#### Scenario: Unfired timer discarded on exit
- **WHEN** an instance on a step with an unfired timer takes any transition off
  that step before the timer's `fireAt`
- **THEN** the timer never fires and is absent from the instance's armed timers
  on the new step

### Requirement: Fire a transition timer as a guard-bypassing forced transition

A timer whose `onFire` specifies a `targetPath` SHALL, when due, force a
transition along that path regardless of the path's guard. The transition SHALL
run the timer's `onFire.actions` together with the ordinary trigger actions,
record a history entry with `cause: "timer"`, then run the instance to rest via
automatic-path evaluation.

#### Scenario: Timer forces transition despite a false guard
- **WHEN** a due transition timer targets a path whose guard evaluates to false
- **THEN** the instance transitions along that path anyway, and the history entry
  for the transition has `cause: "timer"`

#### Scenario: onFire actions are delivered
- **WHEN** a transition timer with `onFire.actions` fires
- **THEN** those actions are enqueued for at-least-once delivery through the
  outbox alongside the target path's trigger actions

#### Scenario: Instance runs to rest after firing
- **WHEN** a transition timer fires onto an all-automatic step whose guard matches
  an onward path
- **THEN** the instance continues through the automatic cascade and comes to rest
  on a manual, wait, or terminal step

### Requirement: Fire a reminder timer as a side effect only

A timer whose `onFire` specifies `actions` but no `targetPath` SHALL, when due,
enqueue those actions and mark itself fired without transitioning. The instance
remains on the same step.

#### Scenario: Reminder fires without transitioning
- **WHEN** a due reminder timer (actions, no `targetPath`) fires on a step
- **THEN** its actions are enqueued for delivery, the timer is marked `fired`, and
  the instance's `currentStepId` and `transitionSeq` are unchanged

### Requirement: Poll and fire due timers, surviving restart

The engine SHALL run a scheduler that periodically finds instances with an
unfired timer whose `fireAt` is at or before the current time and fires it.
Because `fireAt` is persisted at entry, a scheduler started after a crash SHALL
fire any timer that came due while it was down.

#### Scenario: Due timer fires on the next poll
- **WHEN** the scheduler polls and an armed timer's `fireAt` is in the past
- **THEN** that timer fires on that poll pass

#### Scenario: Overdue timer fires after restart
- **WHEN** a scheduler starts and an instance holds an unfired timer whose
  `fireAt` elapsed while no scheduler was running
- **THEN** the scheduler fires that timer

### Requirement: Fire each timer at most once

A timer SHALL fire at most once even under concurrent schedulers or a re-scan
after a crash. A transition-timer fire is serialized by the instance's
optimistic-concurrency token, and a reminder-timer fire is guarded by the timer's
`fired` flag, so a redundant fire attempt is a no-op rather than a duplicate.

#### Scenario: Concurrent pollers fire once
- **WHEN** two scheduler passes attempt to fire the same due transition timer
  concurrently
- **THEN** exactly one transition commits and the other is rejected by the
  concurrency token with no second transition

#### Scenario: Reminder does not re-fire
- **WHEN** a reminder timer already marked `fired` is seen again by a later poll
- **THEN** its actions are not enqueued a second time
