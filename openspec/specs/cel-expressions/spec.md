# cel-expressions

## Purpose

Defines the CEL language binding for the engine: the chosen library, the formal
expression context (namespaces and their shapes), the scoping of `result`, and
authoring-time parse + type-checking of every Expression against the field catalog.

## Requirements

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

### Requirement: Engine evaluates guards with the shared CEL library

The engine SHALL evaluate a path guard at runtime using the same
`@marcbachmann/cel-js` library used for authoring-time parse and type-checking, so
that an expression that type-checks at authoring evaluates with identical
semantics at runtime. Evaluation SHALL be against the instance's frozen context
(`data`, `instance`, `actor`, and named data-source results), and MUST honor the
same scoping rules as the authoring check (`result` is never visible to a guard;
`child` only inside a subprocess step).

#### Scenario: A guard that type-checks evaluates under the same semantics
- **WHEN** a guard expression passes authoring-time type-checking and is later evaluated for a transition
- **THEN** it is evaluated by the same library with no separate dialect or grammar, producing a boolean over the frozen context

#### Scenario: Guard evaluation cannot see the Action.output-only namespace
- **WHEN** a guard expression is evaluated
- **THEN** the `result` namespace is not registered, so referencing it is not resolvable

### Requirement: Runtime instance is projected onto INSTANCE_SCHEMA from one source of truth

The runtime `Instance` SHALL be projected onto the CEL `instance` namespace
through a single projection derived from `INSTANCE_SCHEMA` — the same schema the
authoring check registers. The projection MUST expose exactly the fields
`INSTANCE_SCHEMA` declares (`id`, `status`, `transitionSeq`, `currentStepId`),
mapping the runtime field `instanceId` to `id` and omitting every other runtime
field. `INSTANCE_SCHEMA` SHALL be the sole definition of that field set, so the
authoring context and the runtime projection cannot drift.

#### Scenario: instance.id resolves to the instance's id at runtime
- **WHEN** a guard references `instance.id` and is evaluated against a projected runtime instance
- **THEN** it resolves to the instance's identifier (the runtime `instanceId`), never `undefined`

#### Scenario: Projection exposes only the whitelisted fields
- **WHEN** a guard references a runtime instance field outside `INSTANCE_SCHEMA` (e.g. `instance.definitionHash`)
- **THEN** it is not resolvable, matching the authoring-time context exactly

#### Scenario: Authoring context and runtime projection share one field set
- **WHEN** the whitelisted field set is changed in `INSTANCE_SCHEMA`
- **THEN** both the authoring check and the runtime projection reflect the change with no second field list to update
