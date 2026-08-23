<!-- antislop: allow-file passive-voice sentence-length em-dash -- a MODIFIED delta copies the original requirement block verbatim, and that prose predates these rules -->

## MODIFIED Requirements

### Requirement: A duration is validated on the publish path, never on the read path

A `duration` value SHALL be validated against the ISO-8601 grammar the engine
supports — weeks, days, hours, minutes and seconds, no calendar units, at least one
component — when a definition is published. A value outside that grammar is a publish
error, naming the offending field.

Arming totality is the reason for that placement. Arming computes a duration timer's
`fireAt` while entering the **target** step, inside the transition commit. An
unvalidated duration that raises there does not fail one instance. It makes the step
unreachable for every instance of the definition, and it makes the definition
uninstantiable when that step is the initial step. Reached through the scheduler the
same raise is swallowed and retried on every poll indefinitely.

This validation MUST NOT run when a stored definition is read back. The contract
module also deserializes published bodies, and published versions are immutable while
instances pin `{processId, version, definitionHash}`. A check that tightens over time
and runs on the read path would make an already-published definition fail to parse,
leaving its pinned instances unrehydratable with no repair path.

That read-path cost stays small, and it does not decide this placement on its own. The
poison-instance requirement below puts the row body parse and the body resolution
inside each instance's own error boundary. One unparseable body therefore skips its
own instance and never aborts a pass. `definition-contract` states the general rule.
Placement weighs the read-path cost. The read path never vetoes a schema refinement
by itself.

The grammar applies to every duration-typed field. The magnitude bound below applies
only to `Timer.duration`.

#### Scenario: A malformed duration is rejected at publish

- **WHEN** a timer declares a duration outside the supported grammar — a calendar
  unit (`P1Y`, `P3M`), a non-ISO string (`1 day`), an empty designator (`P`, `PT`), or
  a trailing bare time designator (`P1DT`)
- **THEN** publishing rejects it, naming the offending field

#### Scenario: A supported duration is accepted

- **WHEN** a timer declares `P1W`, `P1D`, `PT1H`, `PT30M`, `PT1.5S`, or a combination
  such as `P1DT2H30M`
- **THEN** publishing accepts it

#### Scenario: A body published before the check still reads

- **WHEN** a stored definition carries a duration the current grammar rejects, having
  been published when no such check existed
- **THEN** reading it back still parses successfully, so its pinned instances keep
  rehydrating, while republishing that same body is rejected

#### Scenario: The grammar reaches every duration-typed field

- **WHEN** a malformed duration appears on an action's `timeout` or `retry.baseDelay`,
  in any action position — step entry, exit, cancel, a path's actions, or a timer's
  fire actions
- **THEN** publishing rejects it, naming that field's location

#### Scenario: A validated duration does not raise at arming

- **WHEN** an instance enters a step whose duration timers all passed validation, from
  any entry instant before the stated ceiling
- **THEN** arming computes a `fireAt` for each without raising, and the entry commits
