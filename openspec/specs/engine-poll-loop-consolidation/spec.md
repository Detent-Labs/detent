# engine-poll-loop-consolidation

## Purpose

A structural (mechanism-level) constraint on the engine's background
workers: `startEngine` (`src/engine/host.ts`) drives the outbox,
resolution and timer drains (`drainOutbox`, `drainResolutions`,
`drainTimers`) through one shared poll-loop scheduling implementation
(`pollForever` in `src/engine/poll.ts`), instead of independently
maintained, structurally identical copies. External behavior (polling
cadence, swallow-and-retry on a transient drain failure, stop semantics)
is unaffected — this is a pure, behavior-preserving extraction that
touches none of [[transactional-outbox]]'s or [[timers]]'s delivery/firing
semantics. This capability exists purely to keep the "don't re-duplicate
this" constraint from silently regressing as more poll-loop-driven engine
workers are added. Added by the archived change
`2026-07-27-dedupe-engine-poll-loops`.

## Requirements

### Requirement: Engine poll-loop workers share one scheduling implementation

`startEngine` (`src/engine/host.ts`) SHALL drive the outbox, resolution
and timer drains (`drainOutbox`, `drainResolutions`, `drainTimers`)
through one shared poll-loop implementation (`pollForever` in
`src/engine/poll.ts`), not independently-maintained, structurally
identical `stopped`/`timer`/`setTimeout` loops. Each `pollForever` call
SHALL keep its own arguments (worker name, tick closure, interval)
independent of the other calls. A tick that throws SHALL be swallowed,
with the next tick retrying on the same fixed interval.

#### Scenario: A worker polls its drain function on a fixed interval

- **WHEN** the engine starts and any of the outbox, resolution or timer
  `pollForever` calls runs with a given interval
- **THEN** its drain function is invoked once per interval, starting
  after the first interval's delay (no immediate first call)

#### Scenario: A transient drain failure does not stop polling

- **WHEN** a worker's drain call throws (e.g. a transient DB failure)
- **THEN** the failure is swallowed and the next tick is still
  scheduled one interval later

#### Scenario: Stopping lets an in-flight tick finish but schedules no further tick

- **WHEN** `startEngine`'s returned `stop()` is called, including while a
  tick is in flight
- **THEN** the in-flight tick (if any) is allowed to complete, and no
  further tick is scheduled after it
