## ADDED Requirements

### Requirement: Every step's assignment type must be the static strategy

Authoring-time validation SHALL check each `Step.assignment.strategy.type` in
a compiled body directly: a `type` other than `"static"` SHALL produce a
located issue and SHALL NOT be checked further (its `config` is not validated
when its `type` is already rejected). A step with no `assignment` declared is
not visited by this check. No registry is consulted — `"static"` is the only
supported strategy type.

#### Scenario: A step declaring the static strategy passes the type check

- **WHEN** a compiled body's step declares `assignment.strategy.type: "static"`
- **THEN** the type check for that step's assignment produces no issue

#### Scenario: A step declaring a non-static strategy type is rejected

- **WHEN** a compiled body's step declares `assignment.strategy.type` other
  than `"static"`
- **THEN** validation produces a located issue naming the step and its
  rejected `type`, and does not also report a config issue for that same
  assignment

#### Scenario: A step with no assignment declared is not checked

- **WHEN** a compiled body's step has no `assignment` field
- **THEN** validation produces no issue for that step's assignment

### Requirement: A static assignment's config is checked against a candidates schema

For every step whose `assignment.strategy.type` is `"static"`, authoring-time
validation SHALL parse its `config` against `{ candidates: string[] }` and
SHALL produce a located issue for each violation when the parse fails. This
schema is fixed (not resolved from any registry), since `"static"` is the
only supported strategy.

#### Scenario: A config with a valid candidates array passes

- **WHEN** a step's `assignment.strategy.config` is `{ candidates: [...] }`
  with every entry a string
- **THEN** validation produces no issue for that step's assignment config

#### Scenario: A config missing candidates is rejected

- **WHEN** a step declares `assignment: { strategy: { type: "static",
  config: {} } }` (missing `candidates`)
- **THEN** validation produces a located issue for that step's assignment
  config

#### Scenario: A config with a non-string candidates entry is rejected

- **WHEN** a step's `assignment.strategy.config.candidates` contains a
  non-string entry
- **THEN** validation produces a located issue for that step's assignment
  config

## MODIFIED Requirements

### Requirement: checkAssignmentRegistry is invoked at publish, alongside checkActionRegistry

`publishBody` SHALL invoke `checkAssignmentRegistry(body)` at the same
placement as every other publish-time check: after the hash-hit no-op
return, on the compiled body, alongside `checkActionRegistry` and before/
alongside CEL and cross-process validation. A violation SHALL throw
`AssignmentRegistryValidationError` carrying every located issue, collected
rather than failing on the first found — matching `RegistryValidationError`.
No `Registry`/`AssignmentRegistry` argument is passed — the check is direct,
with no registry to resolve against.

#### Scenario: An identical re-publish of an already-stored body stays a no-op

- **WHEN** `publishBody` is called with a body whose hash matches an
  already-published version, even if that version predates this check's
  current form
- **THEN** the call returns the existing version without invoking
  `checkAssignmentRegistry`

#### Scenario: A publish with a non-static assignment type throws with every located issue

- **WHEN** `publishBody` is called with a compiled body containing two steps
  whose `assignment.strategy.type` is each not `"static"`
- **THEN** it throws `AssignmentRegistryValidationError` carrying a located
  issue for each of the two steps, not only the first

## REMOVED Requirements

### Requirement: Every step's assignment type resolves in the assignment-strategy registry

**Reason**: There is no longer an `assignmentStrategies` registry to resolve
against — only `"static"` is a supported strategy type, checked directly.

**Migration**: No author-facing change for a body that already only used
`"static"`. A body declaring any other `assignment.strategy.type` was already
a publish error (unregistered type) and remains a publish error (non-static
type), with the same located-issue shape.

### Requirement: A resolved assignment's config is checked against its strategy's schema

**Reason**: Superseded by "A static assignment's config is checked against a
candidates schema" — there is no longer a registry of strategies each
declaring its own `configSchema`; `"static"`'s `{ candidates: string[] }`
shape is the only schema and is checked directly, not resolved per-type.

**Migration**: No author-facing change — the built-in static strategy's
config requirement (`candidates: string[]`) is unchanged; only the
validation mechanism (direct check vs. registry-resolved `configSchema`)
differs.
