## MODIFIED Requirements

### Requirement: Engine evaluates guards with the shared CEL library

The engine SHALL evaluate a path guard at runtime using the same
`@marcbachmann/cel-js` library used for authoring-time parse and type-checking, so
that an expression that type-checks at authoring evaluates with identical
semantics at runtime. Evaluation SHALL be against the instance's frozen context
(`data`, `instance`, `actor`, and named data-source results), and MUST honor the
same scoping rules as the authoring check (`result` is never visible to a guard;
`child` only inside a subprocess step).

Guard evaluation SHALL be total: a guard that raises a runtime error — most
commonly a reference to a field not yet written into `data` — evaluates to `false`
and MUST NOT throw. The path is therefore not taken, and an instance on an
all-automatic step whose guards all evaluate false waits (the wait-state idiom:
`data.booking_status == 'booked'` is false until the writeback lands, then true).

#### Scenario: A guard that type-checks evaluates under the same semantics
- **WHEN** a guard expression passes authoring-time type-checking and is later evaluated for a transition
- **THEN** it is evaluated by the same library with no separate dialect or grammar, producing a boolean over the frozen context

#### Scenario: Guard evaluation cannot see the Action.output-only namespace
- **WHEN** a guard expression is evaluated
- **THEN** the `result` namespace is not registered, so referencing it is not resolvable

#### Scenario: A guard on a field not yet written evaluates false
- **WHEN** a guard references a `data` field that has no value in the instance payload (e.g. a wait-state guard before its action's writeback)
- **THEN** evaluation returns `false` rather than raising, so the path is not taken and the instance waits

#### Scenario: A runtime-unresolvable reference evaluates false, not an error
- **WHEN** a guard is evaluated and references a name that does not resolve in the guard context
- **THEN** evaluation returns `false` (totality), while authoring-time type-checking remains the layer that rejects such a reference outright
