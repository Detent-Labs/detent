## ADDED Requirements

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
