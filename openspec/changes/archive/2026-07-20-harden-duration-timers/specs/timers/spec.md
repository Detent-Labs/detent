## ADDED Requirements

### Requirement: A duration is validated on the publish path, never on the read path

A `duration` value SHALL be validated against the ISO-8601 grammar the engine
supports — weeks, days, hours, minutes and seconds, no calendar units, at least one
component — when a definition is published. A value outside that grammar is a publish
error, naming the offending field.

This validation MUST NOT run when a stored definition is read back. The contract
module is also the deserializer for published bodies, and published versions are
immutable while instances pin `{processId, version, definitionHash}`. A check that
tightens over time and runs on the read path would make an already-published
definition fail to parse, leaving its pinned instances unrehydratable with no repair
path, and — because the workers resolve a body outside their per-instance error
handling — would starve every other instance in the same pass. Validation that may
tighten belongs on the write path, alongside expression checking and plugin-config
validation.

Enforcing it at publish is also what makes arming total for the duration branch.
Arming computes a duration timer's `fireAt` while entering the **target** step, inside
the transition commit, so an unvalidated duration that raises there does not fail one
instance: it makes the step unreachable for every instance of the definition, and
makes the definition uninstantiable when that step is the initial step. Reached
through the scheduler the same raise is swallowed and retried on every poll
indefinitely.

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

### Requirement: Every armed fireAt is fixed-width and lexically sortable

An armed `fireAt` SHALL always carry the form `YYYY-MM-DDTHH:mm:ss.sssZ`, whichever
branch produced it. The scheduler selects the earliest timer on a step by lexical
comparison, so a value rendered in the expanded-year form — whose leading sign sorts
before every digit — would be selected as earliest regardless of the instant it
denotes, suppressing every other timer on that step.

A `Timer.duration` SHALL therefore additionally be bounded. Because `fireAt` is
`entryInstant + duration`, and the publish check cannot know the entry instant, the
bound is derived from a fixed, stated ceiling on the entry instant: a duration that
passes cannot produce an out-of-range `fireAt` when armed from any entry before that
ceiling. Bounding by the representable window alone is necessary but NOT sufficient —
a duration well inside that window still overflows when added to a present-day entry.
The ceiling MUST be a constant rather than the validation-time clock, so publishing
the same body twice yields the same verdict.

The bound exists to preserve the representation, not to express a policy about how far
ahead a timer may be scheduled, and so applies only where a `fireAt` is computed:
`retryPolicy.baseDelay` and `action.timeout` carry the grammar but not the bound.

#### Scenario: An out-of-range duration is rejected at publish

- **WHEN** a timer declares a grammar-valid duration that would overflow — one past
  the representable window (`P9999999D`), or one inside that window which still
  overflows from an ordinary present-day entry (`P3000000D`)
- **THEN** publishing rejects it

#### Scenario: The bound does not apply to fields that compute no instant

- **WHEN** an action's `retry.baseDelay` or `timeout` carries a grammar-valid duration
  larger than the timer bound
- **THEN** publishing accepts it

#### Scenario: Both branches produce the same form

- **WHEN** a step carries both a `duration` timer and a `deadline` timer and an
  instance enters it
- **THEN** both armed `fireAt` values match `YYYY-MM-DDTHH:mm:ss.sssZ`, and the
  earliest-timer selection between them reflects true chronological order
