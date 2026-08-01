<!-- antislop: allow-file passive-voice -->

## ADDED Requirements

### Requirement: Assignment candidates are resolved through the registry before the entry commits

For any step carrying a declared `assignment`, the engine SHALL resolve its
candidates through the injected `AssignmentRegistry`. It calls the resolver that
the step's `strategy.type` holds. The resolved set SHALL reach `planStepEntry`
as a caller-supplied override. A caller-supplied timer set already travels that
way. `planStepEntry` SHALL stay pure and synchronous, and SHALL NOT call a
resolver.

The resolver call SHALL happen before the transaction that commits the entry
opens. The commit SHALL set `instance.assignment` to that list, with
`claimedBy` and `claimedAt` unset. A step with no `assignment` declared SHALL
leave `instance.assignment` unset, and SHALL call no resolver.

Instance creation at an initial step carrying a declared `assignment` SHALL
resolve candidates the same way, before its own write. Creation is a step entry.
This matches how creation already arms the initial step's timers without routing
through `planStepEntry`.

#### Scenario: Entering a step with a declared assignment populates candidates atomically

- **WHEN** a transition commits an instance onto a step with a declared
  `assignment`
- **THEN** the same commit sets `instance.assignment.candidates` to the
  strategy's resolved result, with `claimedBy` and `claimedAt` unset

#### Scenario: Entering a step with no declared assignment leaves it unset

- **WHEN** a transition commits an instance onto a step with no `assignment`
  field
- **THEN** `instance.assignment` remains unset, and no resolver runs

#### Scenario: Creating an instance at an assignment-bearing initial step populates candidates

- **WHEN** an instance is created at an `initialStep` carrying a declared
  `assignment`
- **THEN** the created instance's `instance.assignment.candidates` reflects the
  strategy's resolved result

#### Scenario: The planner stays free of resolution

- **WHEN** `planStepEntry` runs for a step with a declared `assignment`
- **THEN** it consumes the caller's resolved candidate set, and calls no
  resolver itself

### Requirement: Carrying an assignment forward calls no resolver

Migration's remap carries `instance.assignment` forward byte-for-byte instead of
resolving it fresh. The engine SHALL skip the resolver call entirely in that
case, rather than calling it and discarding the result. A migration therefore
costs no resolver work, whatever a strategy does internally.

#### Scenario: A migration resolves nothing

- **WHEN** a migration remaps an instance onto a target step with a declared
  `assignment`
- **THEN** no resolver runs, and `instance.assignment` is unchanged from what
  the instance carried before the migration

## MODIFIED Requirements

### Requirement: The built-in static assignment strategy resolves candidates from a flat config list

The built-in static strategy (`type: "static"`, a registered entry in the
`AssignmentRegistry`) SHALL resolve `candidates` as exactly `config.candidates`
(`config` being `assignment.strategy.config`). That is a flat `string[]` of role
names and actor ids, with no CEL evaluation and no dynamic lookup.

`"static"` is no longer the only supported strategy type. It remains the entry
an author gets by default.

#### Scenario: A static strategy resolves its configured candidate list verbatim

- **WHEN** a step declares `assignment: { strategy: { type: "static", config:
  { candidates: ["finance-approver", "user_42"] } } }`
- **THEN** entering that step sets `instance.assignment.candidates` to exactly
  `["finance-approver", "user_42"]`

## REMOVED Requirements

### Requirement: Assignment candidates are resolved synchronously at step entry

**Reason**: Resolution now calls a registered resolver, which answers
asynchronously. The replacement requirement covers the same entry points, and
moves the call out of `planStepEntry` to keep the planner pure.

**Migration**: None. The registered `static` resolver returns its configured
list unchanged, so every existing body behaves as before.
