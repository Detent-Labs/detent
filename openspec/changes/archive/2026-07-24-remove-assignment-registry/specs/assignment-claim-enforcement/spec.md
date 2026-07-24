## MODIFIED Requirements

### Requirement: Assignment candidates are resolved synchronously at step entry

`planStepEntry` SHALL, for any step carrying a declared `assignment`, resolve
its `static` strategy's `config.candidates` directly — pure, synchronous, no
registry lookup — and set `instance.assignment = { candidates, claimedBy:
undefined, claimedAt: undefined }` as part of the same commit that moves the
instance onto that step. A step with no `assignment` declared SHALL leave
`instance.assignment` unset. Instance creation at an initial step carrying a
declared `assignment` SHALL resolve candidates the same way, inside the same
creation transaction — creation is a step entry, matching how it already
arms the initial step's timers and enqueues a subprocess spawn without
routing through `planStepEntry`.

#### Scenario: Entering a step with a declared assignment populates candidates atomically

- **WHEN** a transition commits an instance onto a step with a declared
  `assignment`
- **THEN** the same commit sets `instance.assignment.candidates` to the
  strategy's resolved result, with `claimedBy` and `claimedAt` unset

#### Scenario: Entering a step with no declared assignment leaves it unset

- **WHEN** a transition commits an instance onto a step with no
  `assignment` field
- **THEN** `instance.assignment` remains unset, unchanged from today's
  behavior

#### Scenario: Creating an instance at an assignment-bearing initial step populates candidates

- **WHEN** an instance is created at an `initialStep` carrying a declared
  `assignment`
- **THEN** the created instance's `instance.assignment.candidates` reflects
  the strategy's resolved result

### Requirement: The built-in static assignment strategy resolves candidates from a flat config list

The built-in static strategy (`type: "static"`, the only supported
assignment strategy type) SHALL resolve `candidates` as exactly
`config.candidates` (`config` being `assignment.strategy.config`), a flat
`string[]` of role names and/or actor ids, with no CEL evaluation and no
dynamic lookup.

#### Scenario: A static strategy resolves its configured candidate list verbatim

- **WHEN** a step declares `assignment: { strategy: { type: "static",
  config: { candidates: ["finance-approver", "user_42"] } } }`
- **THEN** entering that step sets `instance.assignment.candidates` to
  exactly `["finance-approver", "user_42"]`
