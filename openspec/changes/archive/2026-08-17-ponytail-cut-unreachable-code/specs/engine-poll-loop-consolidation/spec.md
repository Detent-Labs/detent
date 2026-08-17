<!-- antislop: allow-file passive-voice -->
<!-- Every scenario in this file uses the fixed SHALL/WHEN/THEN Gherkin
     grammar the rest of this repo's specs already use (see
     data-retention/spec.md's own allow-file passive-voice for the same
     reason). That grammar is structurally passive ("WHEN X is called",
     "THEN Y is redacted"); rewriting it to dodge the rule would break the
     required Scenario format. -->

## MODIFIED Requirements

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
