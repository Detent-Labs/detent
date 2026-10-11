## ADDED Requirements

### Requirement: A condition site infers to bool

A path guard, a `validation.rule` and a view flag SHALL infer to `bool` at
publish. The view flags are `visible`, `required` and `readonly`. A `dyn`
result stays admissible. The engine acts on a result
only when it is `true`. Any other type counts as false without a message. A
guard then parks the path, and a rule rejects the submission.

The check runs on the publish path, as the other CEL checks do.

#### Scenario: Publish rejects a string-typed guard

- **WHEN** a path guard reads `data.status` alone, and `status` is a `string` field
- **THEN** publish fails with a CEL issue at that guard, naming `expected bool, got string`

#### Scenario: Publish rejects a non-bool guard on a subprocess step

- **WHEN** a subprocess step's path guard reads `child.outcome` alone
- **THEN** publish fails with a CEL issue at that guard, naming `expected bool, got string`

#### Scenario: Publish rejects a typed child output used alone as a guard

- **WHEN** a subprocess step's path guard reads `child.data.amount` alone, and the resolved child's contract types `amount` as a `number`
- **THEN** the cross-process check reports a CEL issue at that guard, naming `expected bool, got double`

#### Scenario: Publish rejects a non-bool view flag

- **WHEN** a view entry's `visible`, `required` or `readonly` expression infers to `int`
- **THEN** publish fails with a CEL issue at that flag, naming the expected and the actual type

#### Scenario: Publish rejects a non-bool validation rule

- **WHEN** a catalog field's `validation.rule`, or a step-level `validation.rule`, infers to `string`
- **THEN** publish fails with a CEL issue at that rule, naming the expected and the actual type

#### Scenario: A bool-typed condition passes

- **WHEN** a guard reads `data.status == "ok"`, or a `boolean` field alone
- **THEN** authoring-time validation accepts it

#### Scenario: A dyn-typed condition passes

- **WHEN** a guard reads a field whose CEL type is `dyn`
- **THEN** authoring-time validation accepts it

#### Scenario: A published body with a non-bool guard keeps running

- **WHEN** a body published before this rule holds a non-bool guard, and an instance pins that body
- **THEN** the body still reads and the instance still runs, because the rule runs on the publish path alone

### Requirement: A matches call takes a string-literal pattern that compiles

A call to `matches` SHALL carry a string literal as its pattern. This holds
for `s.matches("p")` and for `matches(s, "p")`. The literal SHALL compile as a
JavaScript `RegExp`. It SHALL NOT exceed the declared maximum pattern length.

The rule holds at every site the type check covers. A migration transform
counts as one. The rule runs on the publish path. A pattern that does not
compile raises on every evaluation. A guard reads a raise as `false`.

#### Scenario: Publish rejects an uncompilable literal pattern

- **WHEN** a guard reads `data.s.matches("(")`
- **THEN** publish fails with a CEL issue at that guard, naming the pattern

#### Scenario: Publish applies the same rule to the other call form

- **WHEN** a guard reads `matches(data.s, "(")`
- **THEN** publish fails with a CEL issue at that guard, naming the pattern

#### Scenario: Publish rejects a non-literal pattern

- **WHEN** a guard reads `data.s.matches(data.p)`, or `data.s.matches("a" + "b")`
- **THEN** publish fails with a CEL issue at that guard, naming the string-literal rule

#### Scenario: The check reports an over-long literal pattern

- **WHEN** a migration transform's literal pattern exceeds the maximum pattern length
- **THEN** registering the plan fails with a CEL issue at that transform

#### Scenario: Publish finds a call inside a comprehension

- **WHEN** a guard reads `data.items.all(i, i.matches("("))`
- **THEN** publish fails with a CEL issue at that guard

#### Scenario: Publish finds a call under a unary operator

- **WHEN** a guard reads `!data.s.matches("(")`
- **THEN** publish fails with a CEL issue at that guard, naming the pattern

#### Scenario: A migration transform meets the same rule

- **WHEN** a migration plan's transform reads `data.s.matches(data.p)`
- **THEN** registering the plan fails with a CEL issue at that transform

#### Scenario: A valid literal pattern passes

- **WHEN** a guard reads `data.s.matches("^[a-z]+$")`
- **THEN** authoring-time validation accepts it

## MODIFIED Requirements

<!-- antislop: allow passive-voice - copied whole from the live spec -->

### Requirement: A timer deadline is validated against the context the engine builds

<!-- antislop: allow sentence-length synonym-rotation - copied whole from the live spec -->

The engine evaluates a `deadline` over the guard context it builds at runtime, which
is `data`, `instance` and `actor` and nothing else. Authoring-time validation SHALL
therefore withhold from a `deadline` site every namespace that context does not
carry, so that an expression the engine cannot honour is a publish error rather than
a timer that never arms.

<!-- antislop: allow passive-voice sentence-length em-dash - copied whole from the live spec -->

The `child` namespace SHALL be withheld: a deadline is evaluated at entry, before any
child instance exists. Data sources SHALL be withheld — but as everywhere, not as a
deadline-specific exception: no CEL site registers a data source, because none is
resolved at evaluation. A deadline referencing either raises at every arming, for
every instance of the definition, permanently, so each is a publish error instead.

<!-- antislop: allow passive-voice sentence-length em-dash - copied whole from the live spec -->

A `deadline` SHALL additionally be required to infer to `string`. A deadline is
parsed into an instant, and a value that is not one is dropped at arming — at which
point it is indistinguishable from a timer that was never declared. An expression
inferring to `dyn` is accepted, because a plugin field type's real type is not
knowable at authoring time.

<!-- antislop: allow passive-voice - copied whole from the live spec -->

#### Scenario: data-source reference in a deadline is rejected

- **WHEN** a timer `deadline` expression references a declared data-source result
- **THEN** authoring-time validation rejects it as an unknown reference

#### Scenario: a data source is not visible to a guard either

<!-- antislop: allow trailing-negation em-dash - copied whole from the live spec -->

- **WHEN** a path guard on that same step references that data-source result
- **THEN** authoring-time validation rejects it as an unknown reference — data sources are withheld from every site, not the deadline alone

<!-- antislop: allow passive-voice - copied whole from the live spec -->

#### Scenario: non-string deadline is rejected

<!-- antislop: allow em-dash - copied whole from the live spec -->

- **WHEN** a timer `deadline` expression infers to a non-string type — a `number`
  field (`double`), a `format: "integer"` field (`int`), a `boolean` field
  (`bool`), or a `list` field (`list<string>`)
- **THEN** authoring-time validation rejects it, naming the expected and actual type

<!-- antislop: allow passive-voice - copied whole from the live spec -->

#### Scenario: string-typed and dyn-typed deadlines are accepted

<!-- antislop: allow sentence-length - copied whole from the live spec -->

- **WHEN** a `deadline` reads a `string` field, whatever `format` that field
  declares, yields a string from an expression, or reads a field whose CEL type
  is `dyn`
- **THEN** authoring-time validation accepts it

#### Scenario: the result-type expectation does not leak to other sites

- **WHEN** an `Action.output` expression infers to a number, or a subprocess
  mapping expression infers to a `string`
- **THEN** each still type-checks, because the `string` expectation belongs to
  the deadline alone
