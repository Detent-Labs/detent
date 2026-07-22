# editor-draft-model

## Purpose

Defines the editor's in-progress editing representation (the Draft): a
structural superset of `AuthoredProcessBody` derived from the contract's
own types, id-minting at creation time, and how "validate" maps onto a
real parse through the contract schemas.

## Requirements

### Requirement: Draft state is a structural superset of AuthoredProcessBody
The editor's in-progress editing state SHALL be a structural superset of
`AuthoredProcessBody` — every entity the contract defines (field catalog,
steps, paths, timers, actions, contract), with required-ness and
cross-reference validity relaxed — so a mid-edit process is representable
without satisfying every contract invariant. This representation SHALL be
derived from the contract's own exported types (imported via `./schema`),
not independently redeclared: the editor SHALL NOT maintain a
hand-written, business-shape-duplicating definition of what a Draft
entity looks like.

#### Scenario: Draft without an initial step is representable
- **WHEN** an author creates a new Draft and adds one step but has not
  designated an initial step
- **THEN** the editor accepts and continues to display this state without
  error

#### Scenario: Draft with a dangling path target is representable
- **WHEN** an author creates a path whose target step does not yet exist
  in the Draft
- **THEN** the editor accepts and continues to display this state without
  error

### Requirement: Editor mints entity ids at creation time
Every entity created in the Draft (step, path, field, timer, action,
contract outcome) SHALL receive a prefixed UUIDv4 id, minted by the
editor at the moment of creation, using the same prefix scheme as the
contract (`step_`, `path_`, etc.). Authors SHALL interact with entities
only via `key` and `label`; the minted `id` SHALL NOT be exposed as an
editable field in the authoring surface.

#### Scenario: New step receives an id immediately
- **WHEN** an author creates a new step in the Draft
- **THEN** the step has a non-empty `id` matching the `step_` prefix
  convention before the author fills in any other field

#### Scenario: Id is stable across the editing session
- **WHEN** an author renames a step's `key` or `label` after creation
- **THEN** the step's `id` does not change, and any path already
  referencing that step by id still resolves to it

### Requirement: Draft validation is a real parse through the contract schemas
Validating a Draft SHALL assemble its current state into the shape of an
`AuthoredProcessBody` and parse it through the actual, unmodified
`authoredProcessBody` Zod schema, collecting every issue rather than
stopping at the first failure. The editor SHALL NOT implement a separate
or relaxed copy of the contract's validation logic.

#### Scenario: Validation collects multiple issues
- **WHEN** a Draft has both a missing `initialStep` and a step with no
  outgoing path
- **THEN** validating the Draft returns issues for both problems, not
  only the first encountered

#### Scenario: A structurally valid Draft parses cleanly
- **WHEN** a Draft satisfies every contract invariant (a complete,
  reference-valid process)
- **THEN** parsing it through `authoredProcessBody` succeeds with no
  issues
