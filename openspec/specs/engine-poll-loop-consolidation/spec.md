# engine-poll-loop-consolidation

## Purpose

A structural (mechanism-level) constraint on the engine's background
workers: `startOutboxWorker`, `startResolutionWorker`, and
`startTimerScheduler` share one poll-loop scheduling implementation
(`pollForever` in `src/engine/poll.ts`), instead of independently
maintained, structurally identical copies. External behavior (polling
cadence, swallow-and-retry on a transient drain failure, stop semantics)
is unaffected — this is a pure, behavior-preserving extraction that
touches none of [[transactional-outbox]]'s or [[timers]]'s delivery/firing
semantics. This capability exists purely to keep the "don't re-duplicate
this" constraint from silently regressing as more poll-loop-driven engine
workers are added. Added for `PONYTAIL-AUDIT.md`'s 2026-07-26 scan,
finding 2.

## Requirements

### Requirement: Engine poll-loop workers share one scheduling implementation

`startOutboxWorker`, `startResolutionWorker`, and `startTimerScheduler`
SHALL drive their respective drain call (`drainOutbox`, `drainResolutions`,
`drainTimers`) through one shared poll-loop implementation (`pollForever`
in `src/engine/poll.ts`), not independently-maintained, structurally
identical `stopped`/`timer`/`setTimeout` loops. Each `startX` function
SHALL keep its own external signature (parameters, defaults, closed-over
arguments to its drain call) unchanged. A tick that throws SHALL be
swallowed, with the next tick retrying on the same fixed interval,
matching pre-consolidation behavior for all three workers.

#### Scenario: A worker polls its drain function on a fixed interval

- **WHEN** any of the three workers is started with a given `intervalMs`
- **THEN** its drain function is invoked once per `intervalMs`, starting
  after the first `intervalMs` delay (no immediate first call), unchanged
  from pre-consolidation behavior

#### Scenario: A transient drain failure does not stop polling

- **WHEN** a worker's drain call throws (e.g. a transient DB error)
- **THEN** the error is swallowed and the next tick is still scheduled
  `intervalMs` later, unchanged from pre-consolidation behavior

#### Scenario: Stopping lets an in-flight tick finish but schedules no further tick

- **WHEN** `stop()` is called on a worker's returned handle, including
  while a tick is in flight
- **THEN** the in-flight tick (if any) is allowed to complete, and no
  further tick is scheduled after it, unchanged from pre-consolidation
  behavior
