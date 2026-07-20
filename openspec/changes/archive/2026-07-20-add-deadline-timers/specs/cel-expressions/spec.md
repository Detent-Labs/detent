## MODIFIED Requirements

### Requirement: Formal expression context

The system SHALL define a single, explicit expression context that enumerates
every namespace a guard may read: `data` (the flat instance payload keyed by
`fieldId`), `instance`, `actor`, each named data-source result, and — only inside
a subprocess step — `child.outcome` and `child.data`. The exact field shapes of
`instance` and `actor` MUST be pinned as types. CEL expressions are pure and
total and MUST NOT reference wall-clock time; there is no `now()`.

The `child` namespace is scoped to a subprocess step's *guards* — the expressions
evaluated when the step is left, once a child has returned. A timer `deadline` on
a subprocess step is NOT in that scope: a deadline is evaluated when the step is
entered, before any child instance exists, so `child.*` could never resolve.
Authoring-time validation SHALL therefore reject a `child` reference in a
`deadline` expression on any step, subprocess or not.

#### Scenario: Guard reads a permitted namespace

- **WHEN** a guard expression references `data.<fieldId>`, `instance.<field>`, `actor.<field>`, or a declared data-source result
- **THEN** the expression type-checks against the defined context

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

## ADDED Requirements

### Requirement: A timer deadline is validated against the context the engine builds

The engine evaluates a `deadline` over the guard context it builds at runtime, which
is `data`, `instance` and `actor` and nothing else. Authoring-time validation SHALL
therefore withhold from a `deadline` site every namespace that context does not
carry, so that an expression the engine cannot honour is a publish error rather than
a timer that never arms.

Data sources SHALL be withheld: they are registered for every other site but are not
resolved at evaluation, so a deadline referencing one raises at every arming, for
every instance of the definition, permanently. They remain visible to guards and to
every other expression site.

A `deadline` SHALL additionally be required to infer to `string`. A deadline is
parsed into an instant, and a value that is not one is dropped at arming — at which
point it is indistinguishable from a timer that was never declared. An expression
inferring to `dyn` is accepted, because a plugin field type's real type is not
knowable at authoring time.

#### Scenario: data-source reference in a deadline is rejected

- **WHEN** a timer `deadline` expression references a declared data-source result
- **THEN** authoring-time validation rejects it as an unknown reference

#### Scenario: the same data source stays visible to a guard

- **WHEN** a path guard on that same step references that data-source result
- **THEN** it type-checks, because only the deadline site withholds the namespace

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
