## MODIFIED Requirements

### Requirement: result namespace scoped to Action.output only

The system SHALL expose the `result` namespace (a handler's structured return)
ONLY within an `Action.output` mapping context, and MUST NOT expose it to any
guard. Guard-context and output-context MUST be distinct so the two cannot be
mixed.

The `Action.output` context SHALL be `result` and nothing else. `data`,
`instance`, `actor`, `child` and data-source results are NOT visible to an output
expression: the writeback runs post-commit against a handler return, not against
instance state, and the engine supplies `{ result }` alone. Authoring-time
validation SHALL therefore reject an output expression referencing any other
namespace, in every action position — `onEntry`, `onExit`, `onPath`, a timer's
`onFire` actions, and `onCancel`.

`onCancel` actions are a checked site like every other action position. An
`Action.output` expression on an `onCancel` action SHALL be parsed and
type-checked against the output context.

#### Scenario: guard references result

- **WHEN** a path or timer guard expression references `result`
- **THEN** authoring-time validation rejects it as an unknown reference

#### Scenario: Action.output references result

- **WHEN** an `Action.output` value expression references `result.<field>`
- **THEN** the expression type-checks against the output context

#### Scenario: Action.output references data

- **WHEN** an `Action.output` value expression references `data.<key>`,
  `instance.<field>`, `actor.<field>`, `child.*`, or a declared data-source result
- **THEN** authoring-time validation rejects it as an unknown reference, because
  the engine supplies only `result` when the writeback is evaluated

#### Scenario: an onCancel action output is checked

- **WHEN** a step's `onCancel` action carries an `Action.output` expression that
  does not parse, or that references a namespace outside `result`
- **THEN** authoring-time validation rejects it and locates it at the `onCancel`
  action

### Requirement: Authoring-time parse validation

The system SHALL parse every `Expression` in a process definition at publish
time. A syntactically invalid `src` MUST be a publish error, surfaced with the
location of the offending expression, not deferred to runtime.

#### Scenario: syntactically broken expression is rejected

- **WHEN** a definition contains an expression whose `src` does not parse as CEL
- **THEN** publish fails and reports which expression is invalid

### Requirement: Authoring-time type-checking against the field catalog

The system SHALL type-check every `Expression` against the process-wide field
catalog and its resolved context. A reference to a field absent from the catalog,
or a type mismatch (e.g. comparing a text field to a number), MUST be a publish
error. This check lives outside `src/schema/definition.ts` (it needs the CEL
library) and is invoked on the write path, never as a Zod refinement: the
contract module is also the deserializer for stored immutable bodies, so a
tightened check placed there would make an already-published definition throw on
READ and its pinned instances unrehydratable.

#### Scenario: unknown field reference is rejected

- **WHEN** an expression references a field key that is not in the field catalog
- **THEN** publish fails and names the unknown reference

#### Scenario: type mismatch is rejected

- **WHEN** an expression compares or combines fields whose catalog types are incompatible
- **THEN** publish fails and reports the type error

#### Scenario: an already-published body still reads after the check tightens

- **WHEN** a definition published before a tightening of the CEL check is
  resolved from the store
- **THEN** the read succeeds and its pinned instances rehydrate, because the
  check runs only on the publish path
