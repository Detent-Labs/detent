## ADDED Requirements

### Requirement: Single CEL implementation for parse and evaluate

The system SHALL use exactly one CEL library, shared by the editor (parse) and
the engine (evaluate), so that a parsed expression and an evaluated expression
carry identical semantics. The library MUST run in-container under Bun and expose
a parse entry point that does not require an evaluation context.

#### Scenario: Editor and engine agree on parse result

- **WHEN** the same `{ lang: "cel", src }` expression is parsed by the editor path and the engine path
- **THEN** both produce the same abstract syntax tree (no divergent grammar or dialect)

#### Scenario: Parse without an evaluation context

- **WHEN** an expression is parsed for authoring-time validation, before any runtime data exists
- **THEN** parsing succeeds or fails on syntax alone, requiring no `data`, `instance`, or `actor` values

### Requirement: Formal expression context

The system SHALL define a single, explicit expression context that enumerates
every namespace a guard may read: `data` (the flat instance payload keyed by
`fieldId`), `instance`, `actor`, each named data-source result, and — only inside
a subprocess step — `child.outcome` and `child.data`. The exact field shapes of
`instance` and `actor` MUST be pinned as types. CEL expressions are pure and
total and MUST NOT reference wall-clock time; there is no `now()`.

#### Scenario: Guard reads a permitted namespace

- **WHEN** a guard expression references `data.<fieldId>`, `instance.<field>`, `actor.<field>`, or a declared data-source result
- **THEN** the expression type-checks against the defined context

#### Scenario: child namespace only inside a subprocess step

- **WHEN** an expression references `child.outcome` or `child.data` outside a subprocess step's guards
- **THEN** authoring-time validation rejects it as an unknown reference

#### Scenario: no wall-clock access

- **WHEN** an expression references `now()` or any time function
- **THEN** authoring-time validation rejects it (time lives only in timers)

### Requirement: result namespace scoped to Action.output only

The system SHALL expose the `result` namespace (a handler's structured return)
ONLY within an `Action.output` mapping context, and MUST NOT expose it to any
guard. Guard-context and output-context MUST be distinct so the two cannot be
mixed.

#### Scenario: guard references result

- **WHEN** a path or timer guard expression references `result`
- **THEN** authoring-time validation rejects it as an unknown reference

#### Scenario: Action.output references result

- **WHEN** an `Action.output` value expression references `result.<field>`
- **THEN** the expression type-checks against the output context

### Requirement: Authoring-time parse validation

The system SHALL parse every `Expression` in a process definition at
publish/validate time. A syntactically invalid `src` MUST be a validation error,
surfaced with the location of the offending expression, not deferred to runtime.

#### Scenario: syntactically broken expression is rejected

- **WHEN** a definition contains an expression whose `src` does not parse as CEL
- **THEN** validation fails and reports which expression is invalid

### Requirement: Authoring-time type-checking against the field catalog

The system SHALL type-check every `Expression` against the process-wide field
catalog and its resolved context. A reference to a field absent from the catalog,
or a type mismatch (e.g. comparing a text field to a number), MUST be a validation
error at authoring time. This check lives outside `src/schema/definition.ts`
(it needs the CEL library) and is invoked from definition validation as a Zod
refinement or a lint pass.

#### Scenario: unknown field reference is rejected

- **WHEN** an expression references a `fieldId` that is not in the field catalog
- **THEN** validation fails and names the unknown reference

#### Scenario: type mismatch is rejected

- **WHEN** an expression compares or combines fields whose catalog types are incompatible
- **THEN** validation fails and reports the type error

#### Scenario: well-typed expression passes

- **WHEN** every expression in a definition parses and type-checks against the catalog and context
- **THEN** validation succeeds
