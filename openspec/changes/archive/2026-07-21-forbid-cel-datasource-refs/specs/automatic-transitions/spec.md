## MODIFIED Requirements

### Requirement: Guards evaluate against the frozen instance context

Automatic-path guards SHALL be evaluated with the same CEL library and formal
context used at authoring time: `data`, `instance`, and `actor`, with fields
referenced by `key`. The `result` namespace (Action.output only) and the `child`
namespace (subprocess steps only) SHALL NOT be visible to a guard, and a data
source is not a readable namespace (the engine resolves none, so a CEL reference to
one is a publish error). Because guards are type-checked at publish time, evaluation
SHALL be total and SHALL NOT throw for a definition that passed publish.

#### Scenario: A guard reads instance data by field key
- **WHEN** an automatic path's guard references a catalog field by `key` and that field's value satisfies the condition
- **THEN** the guard evaluates to true and the path is eligible to be taken

#### Scenario: Guard context excludes result and child
- **WHEN** an automatic-path guard is evaluated on a non-subprocess step
- **THEN** neither the `result` namespace nor the `child` namespace is available to the expression

#### Scenario: Guard context excludes data sources
- **WHEN** an automatic-path guard references a declared data-source result
- **THEN** the reference is not a readable namespace; such a guard cannot have passed publish (it is a publish error), so no published definition reaches evaluation with one
