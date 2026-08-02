<!-- antislop: allow-file passive-voice -->
# assignment-registry-validation

## Purpose

Defines authoring-time validation of a step's `assignment.strategy`. The `type`
resolves against an injected `AssignmentRegistry`. The `config` is parsed
against the schema the resolved entry declares. An unregistered type is a
publish-time issue, never a runtime one, and so is a config the entry's schema
rejects.

The check reuses the resolve-then-parse loop the action and data-source checks
already share. No engine code decides a strategy by comparing its type against a
literal.

## Requirements

### Requirement: Every step's assignment type must resolve in the registry

Authoring-time validation SHALL resolve each `Step.assignment.strategy.type` in
a compiled body against the injected `AssignmentRegistry`. A `type` that the
registry does not hold SHALL produce a located issue. Such a step's `config`
SHALL NOT be checked further, since the schema to check it against is unknown.
A step with no `assignment` declared is not visited by this check.

The reserved `core.` prefix is not exempt here. No internal dispatch reaches an
assignment strategy, so a `core.` type is an unknown type like any other.

#### Scenario: A step declaring a registered strategy passes the type check

- **WHEN** a compiled body's step declares an `assignment.strategy.type` the
  injected registry holds
- **THEN** the type check for that step's assignment produces no issue

#### Scenario: A step declaring an unregistered strategy type is rejected

- **WHEN** a compiled body's step declares an `assignment.strategy.type` the
  injected registry does not hold
- **THEN** validation produces a located issue naming the step and its rejected
  `type`
- **THEN** validation reports no config issue for that same assignment

#### Scenario: A step with no assignment declared is not checked

- **WHEN** a compiled body's step has no `assignment` field
- **THEN** validation produces no issue for that step's assignment

### Requirement: An assignment's config is checked against its registry entry's schema

For every step whose `assignment.strategy.type` resolves in the registry,
authoring-time validation SHALL parse its `config` against the schema the
resolved entry declares. It SHALL produce a located issue for each violation
when the parse fails.

A registered strategy that declares no config schema accepts any `config`. This
matches the opt-in strictness an action handler already has.

#### Scenario: A config valid against the entry's schema passes

- **WHEN** a step's `assignment.strategy.config` satisfies the schema its
  registry entry declares
- **THEN** validation produces no issue for that step's assignment config

#### Scenario: A static config missing candidates is rejected

- **WHEN** a step declares `assignment: { strategy: { type: "static", config: {}
  } }`, and the registered `static` entry declares `{ candidates: string[] }`
- **THEN** validation produces a located issue for that step's assignment config

#### Scenario: A static config with a non-string candidates entry is rejected

- **WHEN** a step's `assignment.strategy.config.candidates` contains a
  non-string entry
- **THEN** validation produces a located issue for that step's assignment config

#### Scenario: A strategy declaring no config schema accepts any config

- **WHEN** a step's strategy resolves to a registry entry that declares no
  config schema
- **THEN** validation produces no config issue for that step, whatever the
  `config` holds

### Requirement: checkAssignmentRegistry is invoked at publish, alongside checkActionRegistry

`publishBody` SHALL invoke `checkAssignmentRegistry(body, assignmentRegistry)`
at the same placement as every other publish-time check. That placement is
after the hash-hit no-op return, on the compiled body, alongside
`checkActionRegistry`, and before CEL and cross-process validation. A violation
SHALL throw
`AssignmentRegistryValidationError` carrying every located issue, collected
rather than failing on the first found. This matches `RegistryValidationError`.

`publishBody` SHALL take the process's `AssignmentRegistry` as a further
argument, beside the action `Registry` and the `DataSourceRegistry` it already
takes. The check resolves against that argument. It never compares against a
literal.

The check SHALL reuse the shared resolve-then-parse loop that
`checkActionRegistry` and `checkDataSourceRegistry` already share. Only the
resolve function and the entity label differ.

#### Scenario: An identical re-publish of an already-stored body stays a no-op

- **WHEN** `publishBody` is called with a body whose hash matches an
  already-published version, which may predate this check
- **THEN** the call returns the existing version without invoking
  `checkAssignmentRegistry`

#### Scenario: A publish with an unregistered assignment type throws with every located issue

- **WHEN** `publishBody` is called with a compiled body containing two steps
  whose `assignment.strategy.type` the injected registry does not hold
- **THEN** it throws `AssignmentRegistryValidationError` carrying a located
  issue for each of the two steps, not only the first

#### Scenario: A body published before a strategy was registered survives re-publish

- **WHEN** `publishBody` is called with a body whose hash already matches a
  stored version
- **WHEN** the current registry no longer holds that body's strategy type
- **THEN** the call returns the existing version, and throws nothing
