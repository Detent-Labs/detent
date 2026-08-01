<!-- antislop: allow-file passive-voice -->

## ADDED Requirements

### Requirement: Assignment candidates are resolved at step entry through the registry

`planStepEntry` SHALL, for any step carrying a declared `assignment`, resolve
its candidates by calling the resolver its `strategy.type` holds in the injected
`AssignmentRegistry`. It SHALL set `instance.assignment = { candidates,
claimedBy: undefined, claimedAt: undefined }`. That write belongs to the same
commit that moves the instance onto the step. A step with no `assignment`
declared SHALL leave `instance.assignment` unset.

Instance creation at an initial step carrying a declared `assignment` SHALL
resolve candidates the same way, inside the same creation transaction. Creation
is a step entry. This matches how creation already arms the initial step's
timers and enqueues a subprocess spawn without routing through `planStepEntry`.

A resolver may return its list asynchronously, so entry SHALL await the
resolution before committing. A deadline bounds that wait, and a failed
resolution commits with empty candidates. The `assignment-strategy-registry`
capability owns both rules.

#### Scenario: Entering a step with a declared assignment populates candidates atomically

- **WHEN** a transition commits an instance onto a step with a declared
  `assignment`
- **THEN** the same commit sets `instance.assignment.candidates` to the
  strategy's resolved result, with `claimedBy` and `claimedAt` unset

#### Scenario: Entering a step with no declared assignment leaves it unset

- **WHEN** a transition commits an instance onto a step with no `assignment`
  field
- **THEN** `instance.assignment` remains unset

#### Scenario: Creating an instance at an assignment-bearing initial step populates candidates

- **WHEN** an instance is created at an `initialStep` carrying a declared
  `assignment`
- **THEN** the created instance's `instance.assignment.candidates` reflects the
  strategy's resolved result

#### Scenario: A failed resolution at creation still creates the instance

- **WHEN** an instance is created at an `initialStep` whose strategy fails to
  resolve
- **THEN** the instance is created, its `candidates` is empty, and an
  `assignment.unresolved` event records the reason

## MODIFIED Requirements

### Requirement: The built-in static assignment strategy resolves candidates from a flat config list

The built-in static strategy (`type: "static"`, a registered entry in the
`AssignmentRegistry`) SHALL resolve `candidates` as exactly `config.candidates`
(`config` being `assignment.strategy.config`). That is a flat `string[]` of role
names and actor ids, with no CEL evaluation and no dynamic lookup. It resolves
synchronously and never fails.

`"static"` is no longer the only supported strategy type. It remains the entry
an author gets by default.

#### Scenario: A static strategy resolves its configured candidate list verbatim

- **WHEN** a step declares `assignment: { strategy: { type: "static", config:
  { candidates: ["finance-approver", "user_42"] } } }`
- **THEN** entering that step sets `instance.assignment.candidates` to exactly
  `["finance-approver", "user_42"]`

## REMOVED Requirements

### Requirement: Assignment candidates are resolved synchronously at step entry

**Reason**: Resolution now calls a registered resolver, which may answer
asynchronously and may fail. The replacement requirement covers the same
entry points and adds the await, the deadline and the failure path.

**Migration**: None. The registered `static` resolver stays synchronous and
never fails, so every existing body behaves as before.
