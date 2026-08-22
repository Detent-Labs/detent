# publish-validation-consolidation

## Purpose

A structural requirement over the publish-time validation sequence. One module
owns the stage order and the per-dimension reporting. The engine's publish path
and the studio's live validation both read that module instead of assembling
the sequence themselves. Companion to `field-tree-check-consolidation` and
`registry-config-check-consolidation`.

## Requirements

### Requirement: One module owns the publish validation sequence

The publish-time validation stages SHALL run from one module, for the stages
that module owns. Those stages are the Zod gate, the duration and structural
checks, the three registry checks, and the single-body CEL check. The
registry checks split into type-resolution and config-validation. That
module owns those stages' order. It owns
the point at which a failing stage among them stops the ones behind it.

Cross-process and process-chaining validation stay outside the module's
ownership. Both resolve a referenced process's published body from the
database before comparing against it. That is a call the module cannot make
on the studio's behalf, since the browser cannot make it either.

`publishBody` SHALL run cross-process and process-chaining validation as a
separate step, after the module's own stages. It resolves each referenced
body and throws immediately on an unresolvable one, exactly as it does
today. Their own comparison logic runs inside the module too, for a caller
that supplies an already-resolved body. So the studio's chaining and
cross-process issues match what `publishBody`'s own separate step finds for
the same resolved bodies. The module never sees `publishBody`'s own call for
those two stages.

The engine's publish path SHALL get its verdict from that module for the
stages it owns. The studio's live validation SHALL get its verdict from the
same module for those same stages. Neither caller SHALL name those stages in
its own body, and neither SHALL state their order in a comment.
`publishBody`'s own cross-process and process-chaining calls stay named and
ordered in `publishBody`'s own body, by design. The module does not own those
two stages.

The module SHALL accept a body plus the inputs a caller can supply. Those
inputs are a registry description and the loaded bodies of referenced
processes. Those inputs also include an optional live registry set
(`Registry`, `AssignmentRegistry`, `DataSourceRegistry`), driving the
config-validation half. Only the engine's own `publishBody` caller supplies
that live registry set. A caller SHALL NOT need to know which stage consumes
which input.

The module's verdict SHALL NOT depend on which caller asked. Given the same
body and the same inputs, the engine and the studio SHALL receive the same
issues. That holds for every stage the module owns.

#### Scenario: Both callers report the same issues for one body

- **WHEN** a body carries an issue in any validated dimension
- **AND** the engine's publish path and the studio's live validation each
  validate that body with the same inputs
- **THEN** both receive the same set of issues for that dimension
- **AND** neither reports an issue the other does not

#### Scenario: A stage the sequence stops behind an earlier issue reports as not run

- **WHEN** a body fails the Zod gate
- **THEN** the result carries the Zod issues
- **AND** every stage behind the Zod gate reports as not run
- **AND** no stage behind the Zod gate reports as passing

#### Scenario: The engine's publish verdict does not change

<!-- antislop: allow synonym-rotation -->
<!-- "error class" names a TypeScript class here (RegistryValidationError and
     its siblings), not the concept "issue". -->

- **WHEN** a body publishes today, with no issue reported
- **THEN** it publishes after this change, with no issue reported
- **AND** a body publish rejects today raises the same error class, carrying
  the same issues
- **AND** that holds for every dimension the module owns (registry
  type/config, CEL)

#### Scenario: A cross-process resolution failure can outrank an earlier chaining issue

- **WHEN** a body violates a process-chaining comparison rule at one
  `process.start` site and a process-chaining resolution precondition at a
  later site
- **THEN** the publish still rejects, raising `CrossProcessValidationError`
- **AND** the message that error carries may differ from today's
  interleaved-walk message for that same body
- **AND** design.md's resolution/comparison split and task 6.13 record that
  divergence as accepted, not a regression

### Requirement: Every dimension reports whether it ran

The validation result SHALL carry, for each dimension, whether that dimension
ran for this body. A dimension whose input the caller did not supply SHALL
report as not run. It SHALL NOT report as passing, and it SHALL NOT be absent
from the result.

A caller SHALL be able to tell three states apart for every dimension. Those
states are "ran and found issues", "ran and found none", and "did not run".

#### Scenario: A dimension without its input reports as not run

- **WHEN** a caller validates a body and supplies no registry description
- **THEN** each of the action-type, assignment-type and data-source-type
  dimensions reports as not run
- **AND** the result carries no issue from any of those three dimensions
- **AND** the caller can tell that state apart from a dimension that ran and
  found no issue

#### Scenario: A dimension with its input reports its findings

- **WHEN** a caller validates a body and supplies a registry description
- **AND** the body names an action type that description does not hold
- **THEN** the action-type dimension reports as run, alongside the
  assignment-type and data-source-type dimensions that same registry
  description also gates
- **AND** the result carries one issue naming that action type

### Requirement: Registry checks separate type resolution from config validation

Each registry check SHALL split into two halves. The type-resolution half
answers whether a registry holds a given `{type}`. The config-validation half
answers whether a given `{config}` satisfies that type's schema.

The type-resolution half SHALL read a serializable registry description. That
description carries the registered type names and nothing a caller cannot send
over the wire. A caller holding only that description SHALL run the
type-resolution half for actions, assignment strategies and data sources
alike.

The config-validation half SHALL keep reading the live registry. A caller
holding only the serializable description SHALL report the config-validation
half as not run.

Splitting the check SHALL NOT change what a publish accepts or rejects. The
publish path holds the live registry, so it runs both halves, exactly as it
does today.

#### Scenario: A wire-side caller resolves types and holds back config validation

- **WHEN** a caller supplies only the serializable registry description
- **AND** the body names an unregistered assignment strategy type
- **THEN** the type-resolution half reports that unregistered type as an issue
- **AND** the config-validation half reports as not run

#### Scenario: The publish path runs both halves

- **WHEN** the publish path validates a body against its live registries
- **AND** the body names a registered action type carrying an invalid config
- **THEN** the type-resolution half finds no issue for that action
- **AND** the config-validation half reports the invalid config as an issue
- **AND** the publish fails, as it does today
