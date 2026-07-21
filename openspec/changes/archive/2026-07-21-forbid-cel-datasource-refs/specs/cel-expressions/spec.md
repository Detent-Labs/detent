## MODIFIED Requirements

### Requirement: Formal expression context

The system SHALL define a single, explicit expression context that enumerates
every namespace a guard may read: `data`, `instance`, `actor`, and — only inside a
subprocess step — `child.outcome` and `child.data`. The exact field shapes of
`instance` and `actor` MUST be pinned as types. CEL expressions are pure and total
and MUST NOT reference wall-clock time; there is no `now()`.

A declared data source is NOT a readable namespace in any CEL scope. The engine
resolves data sources nowhere — no guard, mapping, view flag, deadline, or transform
context carries one — so an expression referencing a data-source `key` could only
park a wait-state permanently (a guard, which is total and evaluates to `false`) or
throw in delivery (a mapping). Authoring-time validation SHALL therefore reject a CEL
reference to a declared data-source result as an unknown reference, in every site, at
publish. (This forbids only the CEL-reference path; the `field.dataSource`
options-binding declaration is a separate concern and is unaffected.)

Within an expression, `data` SHALL be addressed by field **`key`**, not by
`fieldId`: a `field_<uuid>` id is not a valid CEL identifier, so it could not be
written as a member reference at all. The persisted instance payload remains keyed
by `fieldId` — the id stays the sole reference anchor for storage and
cross-references — and both the authoring-time checker and the engine's evaluator
re-key that payload to `key` when they build the context, so the two cannot drift.
A consequence: field keys must be unique within a process, since two fields sharing
a key would shadow each other in every expression.

The `child` namespace is scoped to a subprocess step's *guards* — the expressions
evaluated when the step is left, once a child has returned. A timer `deadline` on
a subprocess step is NOT in that scope: a deadline is evaluated when the step is
entered, before any child instance exists, so `child.*` could never resolve.
Authoring-time validation SHALL therefore reject a `child` reference in a
`deadline` expression on any step, subprocess or not.

#### Scenario: Guard reads a permitted namespace

- **WHEN** a guard expression references `data.<fieldKey>`, `instance.<field>`, or `actor.<field>`
- **THEN** the expression type-checks against the defined context

#### Scenario: Guard referencing a data source is rejected

- **WHEN** a guard (or any other CEL site) references a declared data-source result
- **THEN** authoring-time validation rejects it as an unknown reference at publish, naming the data-source key as an unknown variable

#### Scenario: A field id is not a valid data reference

- **WHEN** a guard expression attempts to reference a field by its `field_<uuid>` id
- **THEN** it does not parse as a member reference, and authoring-time validation rejects it

#### Scenario: child namespace only inside a subprocess step

- **WHEN** an expression references `child.outcome` or `child.data` outside a subprocess step's guards
- **THEN** authoring-time validation rejects it as an unknown reference

#### Scenario: child namespace rejected in a deadline on a subprocess step

- **WHEN** a timer `deadline` expression on a subprocess step references
  `child.outcome` or `child.data`
- **THEN** authoring-time validation rejects it as an unknown reference, because a
  deadline is evaluated at entry when no child exists

#### Scenario: no wall-clock access

- **WHEN** an expression references `now()` or any time function
- **THEN** authoring-time validation rejects it (time lives only in timers)

### Requirement: A timer deadline is validated against the context the engine builds

The engine evaluates a `deadline` over the guard context it builds at runtime, which
is `data`, `instance` and `actor` and nothing else. Authoring-time validation SHALL
therefore withhold from a `deadline` site every namespace that context does not
carry, so that an expression the engine cannot honour is a publish error rather than
a timer that never arms.

The `child` namespace SHALL be withheld: a deadline is evaluated at entry, before any
child instance exists. Data sources SHALL be withheld — but as everywhere, not as a
deadline-specific exception: no CEL site registers a data source, because none is
resolved at evaluation. A deadline referencing either raises at every arming, for
every instance of the definition, permanently, so each is a publish error instead.

A `deadline` SHALL additionally be required to infer to `string`. A deadline is
parsed into an instant, and a value that is not one is dropped at arming — at which
point it is indistinguishable from a timer that was never declared. An expression
inferring to `dyn` is accepted, because a plugin field type's real type is not
knowable at authoring time.

#### Scenario: data-source reference in a deadline is rejected

- **WHEN** a timer `deadline` expression references a declared data-source result
- **THEN** authoring-time validation rejects it as an unknown reference

#### Scenario: a data source is not visible to a guard either

- **WHEN** a path guard on that same step references that data-source result
- **THEN** authoring-time validation rejects it as an unknown reference — data sources are withheld from every site, not the deadline alone

#### Scenario: non-string deadline is rejected

- **WHEN** a timer `deadline` expression infers to a non-string type — a `number`
  field (`double`), a `boolean` field (`bool`), or a `multiselect` field
  (`list<string>`)
- **THEN** authoring-time validation rejects it, naming the expected and actual type

#### Scenario: string-typed and dyn-typed deadlines are accepted

- **WHEN** a `deadline` reads a `date`, `datetime` or `string` field, yields a string
  from an expression, or reads a field whose CEL type is `dyn`
- **THEN** authoring-time validation accepts it

#### Scenario: the result-type expectation does not leak to other sites

- **WHEN** a path guard infers to `bool`, an `Action.output` expression to a number,
  or a view flag to `bool`
- **THEN** each still type-checks, because only the deadline site declares an
  expected result type

### Requirement: Engine evaluates guards with the shared CEL library

The engine SHALL evaluate a path guard at runtime using the same
`@marcbachmann/cel-js` library used for authoring-time parse and type-checking, so
that an expression that type-checks at authoring evaluates with identical
semantics at runtime. Evaluation SHALL be against the instance's frozen context
(`data`, `instance`, and `actor`), and MUST honor the same scoping rules as the
authoring check (`result` is never visible to a guard; `child` only inside a
subprocess step; a data source is not a readable namespace, the engine resolving
none).

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

#### Scenario: A guard referencing a data source is not resolvable at runtime
- **WHEN** the engine evaluates a guard that references a declared data-source result (a body that predates this rule)
- **THEN** the reference is unresolvable, the guard is total and evaluates to `false`, and the instance waits — which is why such a reference is a publish error going forward
