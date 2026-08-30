<!-- antislop: allow-file passive-voice sentence-length em-dash synonym-rotation run-ons -->
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
a parse entry point that needs no evaluation context.

#### Scenario: Editor and engine agree on parse result

- **WHEN** the same `{ lang: "cel", src }` expression is parsed by the editor path and the engine path
- **THEN** both produce the same abstract syntax tree (no divergent grammar or dialect)

#### Scenario: Parse without an evaluation context

- **WHEN** an expression is parsed for authoring-time validation, before any runtime data exists
- **THEN** parsing succeeds or fails on syntax alone, requiring no `data`, `instance`, or `actor` values

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

#### Scenario: well-typed expression passes

- **WHEN** every expression in a definition parses and type-checks against the catalog and context
- **THEN** validation succeeds

### Requirement: A step-level validation rule is a checked expression site

A `rule` declared on a `view.fields[].validation` SHALL be parsed and
type-checked at publish. The catalog field's own `rule` and every other
expression in the body get the same treatment. Its location SHALL name the
step and the view field, so an author can find it.

It SHALL be checked in the scope the engine evaluates it in: `data`,
`instance` and `actor`, with neither `result` nor `child`. That holds on a
subprocess step too, which is the one place the surrounding view field's
`visible`, `required` and `readonly` flags do get `child`. Those three flags
resolve while a child instance can exist. A validation rule runs during
submission, against `buildGuardContext(body, mergedInstance, actor)`, which
registers no `child`. Checking it with `child` in scope would let an author
publish a rule referencing an unbound name. That name is never bound at the
moment the rule runs.

#### Scenario: A syntactically broken step-level rule is rejected

- **WHEN** a step's view field declares a `validation.rule` whose `src` does
  not parse as CEL
- **THEN** publish fails and reports the step and the view field

#### Scenario: An unknown field reference in a step-level rule is rejected

- **WHEN** a step-level `validation.rule` references a field key absent from
  the catalog
- **THEN** publish fails and names the unknown reference

#### Scenario: A step-level rule referencing child is rejected on a subprocess step

- **WHEN** a subprocess step's view field declares a `validation.rule`
  referencing `child`
- **THEN** publish fails, even though the same step's `visible`, `required`
  and `readonly` expressions may reference `child`

#### Scenario: A step-level rule referencing result is rejected

- **WHEN** a step-level `validation.rule` references `result`
- **THEN** publish fails, because `result` is scoped to `Action.output` alone

#### Scenario: A well-typed step-level rule passes

- **WHEN** a step-level `validation.rule` parses and type-checks against the
  catalog and the submission context
- **THEN** publish succeeds

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
- **THEN** the reference is unresolvable, the guard is total and evaluates to `false`, and the instance waits — which is why such a reference is a publish error

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

### Requirement: A catalog field's CEL type follows its type and its format

Every catalog field SHALL report one CEL type, derived from its declared `type`
and its declared `format`:

| declared `type` | CEL type |
|---|---|
| `string` | `string` |
| `number` | `double`, or `int` when `format` is `"integer"` |
| `boolean` | `bool` |
| `list` | `list<string>` |
| `file` | `dyn` |
| `group` | `dyn` |

A field whose `type` is a plugin envelope SHALL report `dyn`, unchanged. A
`group` field is a container. It contributes no entry to the `data` namespace,
and no caller reads its own CEL type as a leaf.

Only `format` moves a CEL type, and only its `integer` member does so. The
`date`, `datetime` and `email` members all sit over `string` and report
`string`.

An author marking a number field `format: "integer"` can then compare it to a
bare CEL integer and take its remainder. Both fail against `double` today. A
bare `3` is a CEL `int`, and the library holds no overload mixing the two. The
same rule makes an expression mixing an integer field with a decimal field a
publish error. No overload covers that pair either.

#### Scenario: An integer field compares against a bare integer literal

- **WHEN** a guard reads a `{type: "number", format: "integer"}` field and
  compares it to `3`
- **THEN** the expression type-checks, and publishing succeeds

#### Scenario: A plain number field still reports double

- **WHEN** a guard reads a `{type: "number"}` field declaring no `format` and
  compares it to `3`
- **THEN** the expression fails the type check, exactly as it does today

#### Scenario: An expression mixing an integer field with a decimal field fails

- **WHEN** an expression adds a `format: "integer"` field to a `number` field
  declaring no format
- **THEN** authoring-time validation rejects it, naming the type error

#### Scenario: A format over string leaves the CEL type alone

- **WHEN** a guard reads a `{type: "string", format: "date"}` field and
  compares it to a string literal
- **THEN** the expression type-checks as a `string` comparison

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
  field (`double`), a `format: "integer"` field (`int`), a `boolean` field
  (`bool`), or a `list` field (`list<string>`)
- **THEN** authoring-time validation rejects it, naming the expected and actual type

#### Scenario: string-typed and dyn-typed deadlines are accepted

- **WHEN** a `deadline` reads a `string` field, whatever `format` that field
  declares, yields a string from an expression, or reads a field whose CEL type
  is `dyn`
- **THEN** authoring-time validation accepts it

#### Scenario: the result-type expectation does not leak to other sites

- **WHEN** a path guard infers to `bool`, an `Action.output` expression to a number,
  or a view flag to `bool`
- **THEN** each still type-checks, because only the deadline site declares an
  expected result type

### Requirement: A migration transform is checked against the source catalog

A migration `transforms` expression SHALL be parse- and type-checked when its plan
is registered, against the **source** version's field catalog rather than the
target's. A transform reads the instance's pre-migration data and writes a target
field, so its identifiers resolve in the version the instance is leaving.

The check therefore spans two bodies — source catalog for the expression, target
catalog for the field it writes — and cannot be expressed by the single-body
validation entry point. It SHALL have its own entry point taking both bodies.

#### Scenario: A transform reading a source field is accepted

- **WHEN** a transform references a field key declared by the source version
- **THEN** it type-checks and registration succeeds

#### Scenario: A transform reading a field only the target declares is refused

- **WHEN** a transform references a field key the source version does not declare
- **THEN** registration fails with a located issue naming the transform

#### Scenario: A transform writing a field the target does not declare is refused

- **WHEN** a `transforms` key names a `FieldId` absent from the target catalog
- **THEN** registration fails

### Requirement: A transform's result type matches the field it writes

A transform's inferred result type SHALL match the declared type of the target
field it writes, with an unknowable type (a plugin field or data source, which
infers as `dyn`) accepted.

Instance `data` is untyped against the catalog, but every guard reading that field
on the target version is typed against it. A transform yielding a string into a
field declared `number` therefore makes each such guard raise, which guard totality
converts to `false` — a silently wrong branch rather than an error. This is the
same failure mode the `deadline` site's expected-type check exists to prevent, and
it uses the same mechanism.

#### Scenario: A matching result type is accepted

- **WHEN** a transform yielding a number targets a field declared `number`
- **THEN** registration succeeds

#### Scenario: A mismatched result type is refused

- **WHEN** a transform yielding a string targets a field declared `number`
- **THEN** registration fails naming the transform and both types

#### Scenario: An unknowable result type is accepted

- **WHEN** a transform's result type infers as `dyn` because it reads a plugin field
- **THEN** registration succeeds, the type being unknowable at this layer

### Requirement: A migration transform sees data and instance only

The context a transform is checked and evaluated against SHALL be `data` (the
source version's catalog, keyed by field `key`) and `instance`, and nothing else.

`actor` SHALL be withheld: migration is an operator action against a whole
population, and admitting `actor` would let a rule that is supposed to be uniform
produce different data per instance. This is the first site to withhold `actor`, so
the environment builder gains a dimension. It is exercised only from the migration
entry point, which builds its own environment, so no existing cached environment
changes meaning.

`child` SHALL be withheld: migration is not a step entry and no child is in scope.

Data sources SHALL be withheld, for the reason a timer `deadline` withholds them:
they are not resolved on this path, so a transform referencing one would raise for
every instance in the population.

`result` remains scoped to `Action.output`. Time functions remain forbidden.

#### Scenario: A transform referencing actor is refused

- **WHEN** a transform references `actor`
- **THEN** registration fails

#### Scenario: A transform referencing a data source is refused

- **WHEN** a transform references a declared data source's result
- **THEN** registration fails

#### Scenario: A transform referencing child is refused

- **WHEN** a transform references `child.outcome` or `child.data`
- **THEN** registration fails

#### Scenario: A transform may read the instance projection

- **WHEN** a transform references a field of `instance`
- **THEN** it type-checks against the same projection guards see

#### Scenario: A transform calling a time function is refused

- **WHEN** a transform calls `now()`, `timestamp()`, or `duration()`
- **THEN** registration fails

#### Scenario: Ordinary sites still resolve actor

- **WHEN** a process body is validated after the migration entry point exists
- **THEN** every guard, view, and mapping site still resolves `actor` exactly as
  before

### Requirement: An authoring surface reaches the AST through the engine's CEL module

An authoring surface may need the parsed shape of an expression, not only a pass
or fail verdict. It SHALL get that shape from the engine package's own CEL
module, over the exports map. No workspace package SHALL declare its own
dependency on the CEL library. Exactly one version pin then exists, and an
upgrade stays the deliberate, reviewed commit the parse-and-evaluate rule
requires.

The module SHALL expose a parse entry point returning the abstract syntax tree.
It SHALL return nothing when the source does not parse. Each node SHALL carry
the source range it covers, so a caller can recover the exact text of any
fragment.

#### Scenario: The studio parses through the engine module

- **WHEN** a studio authoring surface needs the syntax tree of a CEL expression
- **THEN** it gets that tree from the engine package's CEL module, and
  `packages/web` declares no dependency on the CEL library

#### Scenario: Unparseable source yields nothing, not a throw

- **WHEN** an authoring surface parses a source that is not valid CEL
- **THEN** the parse entry point reports the absence of a tree
- **AND** the caller falls back to the plain text surface

#### Scenario: A fragment recovers its own source text

- **WHEN** an authoring surface holds a node of the parsed tree
- **THEN** the node's range identifies the exact substring of the original
  source that produced it

