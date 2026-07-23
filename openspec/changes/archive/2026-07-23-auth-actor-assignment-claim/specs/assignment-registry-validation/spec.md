## ADDED Requirements

### Requirement: Every step's assignment type resolves in the assignment-strategy registry

Authoring-time validation SHALL resolve each `Step.assignment.strategy.type` in a
compiled body against an injected `assignmentStrategies` registry
(`Record<string, AssignmentStrategyDef>`), sibling to the existing action
handler registry. A `Step.assignment` whose `type` is not registered SHALL
produce a located issue and SHALL NOT be checked further (its `config` is
not validated when its `type` is already unresolved). A step with no
`assignment` declared is not visited by this check.

#### Scenario: A step with a registered assignment type passes

- **WHEN** a compiled body's step declares `assignment.strategy.type` present in the
  `assignmentStrategies` registry
- **THEN** the type check for that step's assignment produces no issue

#### Scenario: A step with an unregistered assignment type is rejected

- **WHEN** a compiled body's step declares `assignment.strategy.type` absent from
  the `assignmentStrategies` registry
- **THEN** validation produces a located issue naming the step and its
  unregistered `type`, and does not also report a config issue for that
  same assignment

#### Scenario: A step with no assignment declared is not checked

- **WHEN** a compiled body's step has no `assignment` field
- **THEN** validation produces no issue for that step's assignment

### Requirement: A resolved assignment's config is checked against its strategy's schema

When an `AssignmentStrategyDef` declares a `configSchema`, authoring-time
validation SHALL parse the assignment's `config` against it and SHALL
produce a located issue for each violation when the parse fails. A strategy
with no declared `configSchema` SHALL accept any `config`.

#### Scenario: A config matching its strategy's schema passes

- **WHEN** a resolved step assignment's `config` satisfies its strategy's
  declared `configSchema`
- **THEN** validation produces no issue for that step's assignment config

#### Scenario: A config violating its strategy's schema is rejected

- **WHEN** a resolved step assignment's `config` fails its strategy's
  declared `configSchema`
- **THEN** validation produces at least one located issue identifying the
  step and the schema violation

#### Scenario: The built-in static strategy's config requires a candidates array

- **WHEN** a step declares `assignment: { strategy: { type: "static",
  config: {} } }` (missing `candidates`)
- **THEN** validation produces a located issue for that step's assignment
  config

### Requirement: checkAssignmentRegistry is invoked at publish, alongside checkActionRegistry

`publishBody` SHALL invoke `checkAssignmentRegistry(body, registry)` at the
same placement as every other publish-time check: after the hash-hit no-op
return, on the compiled body, alongside `checkActionRegistry` and before/
alongside CEL and cross-process validation. A violation SHALL throw
`AssignmentRegistryValidationError` carrying every located issue, collected
rather than failing on the first found — matching `RegistryValidationError`.

#### Scenario: An identical re-publish of an already-stored body stays a no-op

- **WHEN** `publishBody` is called with a body whose hash matches an
  already-published version, even if that version predates a strategy's
  `configSchema` tightening
- **THEN** the call returns the existing version without invoking
  `checkAssignmentRegistry`

#### Scenario: A publish with an unregistered assignment type throws with every located issue

- **WHEN** `publishBody` is called with a compiled body containing two
  steps whose `assignment.strategy.type` each fail to resolve in the registry
- **THEN** it throws `AssignmentRegistryValidationError` carrying a located
  issue for each of the two steps, not only the first
