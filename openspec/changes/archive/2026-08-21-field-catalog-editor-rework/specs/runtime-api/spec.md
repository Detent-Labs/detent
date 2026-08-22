<!-- antislop: allow-file passive-voice -->
<!-- Why: matches the same allow-file directive at the top of the live
     openspec/specs/runtime-api/spec.md this delta modifies. Gherkin
     WHEN/THEN scenario text and SHALL-requirement text both read
     naturally passive ("an instance is created", "opts.data is
     validated"); naming an actor for every one would read worse, not
     better. -->
## MODIFIED Requirements

### Requirement: Create a process instance through the runtime API

`createProcessInstance(processId, actor, registry, opts?, db?)` SHALL
create a new instance of the newest published version of `processId`.
It SHALL instead use the version given in `opts.version`, when one is
given. It MAY seed the instance with `opts.data`. It SHALL run the
instance to rest (create-then-`resolveAutomatic`) before returning it.

Before it evaluates any default, `createProcessInstance` SHALL mint
the instance id. It SHALL establish a stub `Instance`, the same one
described below. That stub sets `currentStepId` to the initial step,
`transitionSeq` to `0`, and `status` derived the way
`store.ts::createInstance` derives it.

`createProcessInstance` SHALL initialize a working data object as a
copy of `opts.data`, or an empty object when no `opts.data` is given.
It SHALL then walk leaf fields one at a time, in catalog order. It
SHALL seed each field's slot in that working object from the field
catalog's `default` values. A `Literal` default SHALL write its value
directly into that field's slot. It SHALL do this only when the slot
is still absent. That happens when `opts.data` never set it, or when
an earlier field's default has not already filled it.

An `Expression` default SHALL evaluate through
`src/cel/eval.ts::buildGuardContext(body, stub, actor)`, the same
builder every other guard evaluation reuses. The stub's `.data` SHALL
be set to the working object as filled so far.

That evaluation SHALL run through `src/cel/eval.ts::evalFieldMap`, a
single-entry map holding just that field. `evalFieldMap` SHALL pass
the evaluated value through `coerceJson` before it fills that field's
slot. That is the same coercion `evalMapTotal` already runs, inside
`evalFieldMap`, before a CEL result lands in `data`. `evalTransforms`
(migrations) and `evalOutput` (`Action.output`) both run it too.
`cel-js` models a CEL `int` as a JS `bigint`. Skipping this step would
leave a bigint in a `number` field's slot for even a plain
integer-literal default. That fails `typeMatches` on the next check
this requirement runs.

That call SHALL supply `instance: { id, status, transitionSeq,
currentStepId }`, matching `INSTANCE_SCHEMA` exactly. That is the same
scope `src/cel/check.ts` already type-checks a `default` Expression
against, at publish time. It SHALL also re-key `data` from field id to
field `key`, the same remap every other guard context gets.

CEL stays total here, the same as everywhere else it evaluates a
guard. An Expression default that raises, or whose evaluated value
`coerceJson` cannot make JSON-safe, SHALL leave its field's slot
unfilled. It SHALL NOT fail the creation. A `group` field's own
`default` SHALL NOT be read: a group carries no slot of its own in the
flat data payload. `createProcessInstance` SHALL still walk its
children.

This seeding step SHALL run only inside `createProcessInstance`
itself. It SHALL NOT run for an instance
`src/engine/seeded-create.ts::createSeededInstance` creates: a
subprocess spawn's child instance, or a `process.start` chain's
started instance. Neither of those two calls
`createProcessInstance`. Each already seeds its new instance from its
own author-declared `inputMapping`. This requirement's default-seeding
does not extend there for this change.

The working object SHALL then carry every value `opts.data` set and
every default that filled a slot `opts.data` left open. An explicitly
submitted value SHALL win over a default on the same field, every
time. The seeding step above never overwrites a slot `opts.data`
already filled. That object becomes what this requirement's existing
rules call `opts.data` below, and what carries forward into
`submitted`.

`createProcessInstance` SHALL validate `opts.data` against the initial
step's resolved view before creation. That check covers the field-set
boundary, type, option membership, constraints, and
`validation.rule`. Option membership checks against resolved `options`,
covering both static and `dataSource`-bound fields, per the
`data-source-resolution` capability. These are the same rules
`submitAndTransition` applies to a submission.

The check runs against the same stub `Instance` the defaulting step
above already built and fed `data` into, not a second one. That stub
carries a minted id, a `transitionSeq` of `0`, and `currentStepId` set
to the initial step. Its `status` derives the same way
`store.ts::createInstance` derives it. `createProcessInstance` then
passes that same minted id to the actually-created instance. The
instance created is exactly the one that was validated.

This validation SHALL cover a merged-in default the same way it covers
a submitted value, with two exemptions, one per case below. This
validation otherwise enforces a field-set boundary. That boundary
rejects a key absent from the initial step's resolved view as
`unknown-field`. It rejects a key resolved readonly as
`readonly-field`.

`createProcessInstance` SHALL record the set of field ids the
defaulting step above filled. It SHALL keep that set distinct from the
ids `opts.data` supplied directly. It SHALL thread that set into this
validation.

For a member of that set absent from the initial step's resolved
view — `resolveFields` returns no `ResolvedViewField` for it —
validation SHALL skip the `unknown-field` rejection that field would
otherwise draw. It SHALL check the value against the field's own
declared `type`, its own static `options`, its own `validation`
constraints, and its own effective `validation.rule`. It SHALL NOT
check the value against the initial step's resolved view: a field
outside that view has no `ResolvedViewField` entry to check against,
and no step context to resolve a `dataSource`-bound field's options
against. When that field is `dataSource`-bound, its
option-membership check SHALL be skipped instead, the same treatment a
field carrying an empty options list already gets. A default that
fails one of the remaining checks SHALL throw
`SubmissionValidationError`, the same as a bad `opts.data` value does.

For a member of that set that DOES resolve a `ResolvedViewField`, and
that view resolves it readonly — through a step-level `readonly`
override, or through `FieldDef.technical: true` — validation SHALL
skip the `readonly-field` rejection that field would otherwise draw.
It SHALL otherwise check the value the same way it checks an editable
field on that step: against the field's own declared `type`, the
view-resolved `options`, and the step's own effective validation (the
sibling requirement's ordered checks 1-4 below, including
`validation.rule`). A default that fails one of those checks SHALL
throw `SubmissionValidationError`, the same as a bad `opts.data` value
does.

Neither exemption SHALL extend to a value `opts.data` supplies
directly. An explicitly submitted value for a field outside the
initial step's view SHALL still throw `unknown-field`. An explicitly
submitted value for a field the view resolves readonly SHALL still
throw `readonly-field`. Both exactly as they do today.

`createProcessInstance` SHALL take a required `registry:
DataSourceRegistry` argument. It SHALL thread that registry into the
`resolveFields` call that resolves the initial step's view for this
validation.

The required check SHALL NOT run at creation, whether or not the
caller passes `opts.data`. Requiredness is a transition-time gate. It
is not an existence-time gate on being created at or resting on a
step. The transition function `submitAndTransition` enforces it,
whenever a step is left via a manual path.

An instance MAY be created at a step whose view marks fields required,
left with those fields unfilled. Those fields can be supplied later,
via `submitAndTransition`. That is the ordinary "create an empty
instance, then fill in the initial step's form" flow.
`examples/expense-approval.json`'s "capture" step depends on it: that
step is itself the initial step, and it declares required fields.

#### Scenario: Creating an instance with no data seed
- **WHEN** `createProcessInstance` is called for a process with no `opts.data`,
  even when the initial step's view marks fields required
- **THEN** an instance is created pinned to the resolved version, run to
  rest, and returned. The required check does not block creation

#### Scenario: Creating an instance pins to an explicit version
- **WHEN** `createProcessInstance` is called with `opts.version` set to a
  published version older than the newest
- **THEN** the created instance is pinned to that explicit version, not the
  newest

#### Scenario: Creating an instance with a valid data seed
- **WHEN** `createProcessInstance` is called with `opts.data` satisfying every
  type/option/constraint/rule check on the initial step's view
- **THEN** the instance is created with that data present

#### Scenario: Creating an instance with an invalid data seed is rejected
- **WHEN** `createProcessInstance` is called with `opts.data` carrying a
  value that fails a type, option-membership, constraint, or
  `validation.rule` check on the initial step's view
- **THEN** it throws `SubmissionValidationError` carrying the corresponding
  issue for that field, and no instance is created

#### Scenario: A dataSource-bound field's seed data is validated against its resolved options
- **WHEN** `createProcessInstance` is called with `opts.data` carrying a
  value for a `dataSource`-bound field on the initial step
- **AND** that value does not equal any of the data source's resolved
  options
- **THEN** it throws `SubmissionValidationError` with an `invalid-option`
  issue for that field, and no instance is created

#### Scenario: A seeded technical field is rejected
- **WHEN** `createProcessInstance` is called with `opts.data` carrying a
  key for a `FieldDef` declaring `technical: true`
- **AND** the step whose view resolves it marks it visible
- **THEN** it throws `SubmissionValidationError` with a `readonly-field`
  issue for that key, and no instance is created

#### Scenario: A literal default seeds a field with no submitted value
- **WHEN** `createProcessInstance` is called with `opts.data` that carries
  no value for a field whose catalog entry declares a `Literal` default
- **THEN** the created instance's data carries that literal value for the
  field

#### Scenario: An explicitly submitted value wins over a default
- **WHEN** `createProcessInstance` is called with `opts.data` carrying a
  value for a field that also declares a default
- **THEN** the created instance's data carries the submitted value, not
  the default

#### Scenario: A CEL default evaluates against the seed in progress
- **WHEN** a field's `Expression` default reads `data.subtotal`, and an
  earlier field in catalog order defaults `subtotal` to a literal value
- **THEN** the later field's default evaluates using that earlier
  field's resolved value
- **AND** `data` is re-keyed from field id to field `key` the same way
  any guard context is

#### Scenario: A CEL default evaluates against an earlier submitted value
- **WHEN** a field's `Expression` default reads `data.subtotal`, and
  `opts.data` carries an explicitly submitted value for an earlier
  field in catalog order, `subtotal`
- **THEN** the later field's default evaluates using that submitted
  value
- **AND** this is the same visibility an earlier field's resolved
  default would get

#### Scenario: An earlier field's default cannot read a later field's value
- **WHEN** an earlier-in-catalog-order field's `Expression` default
  reads `data.<key>` of a later field
- **THEN** it raises for the missing key, and that earlier field's
  slot stays unfilled
- **AND** creation still succeeds

#### Scenario: A default reads the instance's own state
- **WHEN** a field's `Expression` default reads `instance.status` or
  `instance.currentStepId`
- **THEN** the default evaluates against the stub `Instance`'s derived
  `status` and its `currentStepId` set to the initial step
- **AND** it does not raise for a missing key

#### Scenario: A raising expression default leaves its field unset
- **WHEN** a field's `Expression` default raises during evaluation, and
  `opts.data` carries no value for that field
- **THEN** the created instance's data carries no value for that field,
  and creation still succeeds

#### Scenario: An expression default evaluating to a CEL int seeds a JSON-safe number
- **WHEN** a `number` field's `Expression` default evaluates to a CEL
  `int`
- **AND** the expression is the bare integer literal `"5"`, or the
  arithmetic expression `"data.qty * data.price"` over two int fields
- **AND** `opts.data` carries no value for that field
- **THEN** the created instance's data carries a JSON-safe `number` for
  that field, not a bigint
- **AND** creation does not throw

#### Scenario: A group field's own default is never read
- **WHEN** a `group` field's catalog entry declares a `default`, and its
  children each declare their own default too
- **THEN** the created instance's data carries no slot for the group
  itself
- **AND** each child's default seeds that child's own slot

#### Scenario: A default that fails validation blocks creation
- **WHEN** a field's `Literal` default does not match the field's
  declared type, and `opts.data` carries no value for that field
- **THEN** it throws `SubmissionValidationError` for that field, the
  same as an invalid submitted value would, and no instance is created

#### Scenario: A default seeds a field the initial step's view does not reference
- **WHEN** a field's default fills a field id absent from the initial
  step's resolved view
- **AND** `booking_status` in `examples/expense-approval.json` is one
  such field, referenced only by the `book` step, never by the initial
  `capture` step
- **THEN** creation succeeds, and that field's slot carries the
  defaulted value
- **AND** the engine validates that value against the field's own
  declared type, options, constraints, and `validation.rule`, rather
  than rejecting it as `unknown-field`

#### Scenario: An off-view default failing its own validation.rule is rejected
- **WHEN** a field's default fills a field id absent from the initial
  step's resolved view
- **AND** the field's own effective `validation.rule` evaluates false
  against that value
- **THEN** it throws `SubmissionValidationError` with a `rule-failed`
  issue for that field, and no instance is created

#### Scenario: An off-view dataSource-bound default skips option-membership validation
- **WHEN** a `dataSource`-bound field's default fills a field id absent
  from the initial step's resolved view
- **THEN** creation succeeds regardless of the default's value, since
  there is no step context to resolve the data source's options
  against
- **AND** the engine still checks that value against the field's own
  declared type and its own `validation` constraints

#### Scenario: A default on an on-view readonly field is judged by the step's own override
- **WHEN** a field's default fills a field id the initial step's
  resolved view marks readonly through a step-level `readonly`
  override
- **AND** the initial step's view field also overrides that field's
  `validation`
- **THEN** creation succeeds, and the engine validates the defaulted
  value against the step's own overridden validation, not the
  catalog's

#### Scenario: A default on a technical field still seeds, without a readonly-field rejection
- **WHEN** a `FieldDef` declaring `technical: true` also declares a
  `Literal` default, and `opts.data` carries no value for that field
- **THEN** creation succeeds, and the created instance's data carries
  that literal value for the field
- **AND** creation raises no `readonly-field` issue for it

### Requirement: Submitted data is validated against field type, options, constraints, and rule

`submitAndTransition` SHALL validate a submission in this order, for
every field key present. It validates the submitted value against the
merged, not-yet-committed data. `createProcessInstance`'s `opts.data`
seed gets the same validation:

<!-- antislop: allow sentence-length -->
<!-- Every sentence below is at or under 20 words. The linter merges a
sentence that opens with a code span into the sentence before it, doubling
the counted length; see antislop-sentence-split-breaks-on-code-span.md. -->
1. A type match against the field's declared `FieldDef.type`. This
   mirrors `check.ts::celType`'s existing mapping. `string`/`date`/
   `datetime`/`select`/`reference` need a JS `string`. `number` needs a
   JS `number`. `boolean` needs a JS `boolean`. `multiselect` needs an
   array of strings. `file` and a plugin (object) type are opaque and
   accepted as-is.
2. If the field's resolved `options` is non-empty, the value (each
   item, for `multiselect`) must equal one resolved option's `value`.
   Resolved `options` comes from static `FieldDef.options`, or from a
   `dataSource`-bound field's runtime-resolved options, per the
   `data-source-resolution` capability.
3. Its effective constraints (`min`, `max`, `minLength`, `maxLength`,
   `pattern`).
4. If present, its effective `rule` CEL expression, evaluated with
   total (`evalGuard`-style) semantics. That evaluation runs against
   `buildGuardContext(body, mergedInstance, actor)`. That is the
   identical context `check.ts` type-checks a catalog field's `rule`
   against (no `result`, no `child`). A rule referencing the field's
   own value does so via `data.<key>`, like any other guard.

The effective validation for a field in a step is the catalog field's
`validation` when the step's matching `view.fields[]` entry declares no
`validation`. When it declares one, per the `definition-contract` capability,
the effective validation overlays the catalog's keys with the step's under
`merge` (the default). Under `replace` it takes the step's alone. The step's
entry is the one whose `ref` names the field. Nothing else about the order or
the reported issues changes. An effective constraint is checked and reported
the way a catalog constraint always was.

`submitAndTransition` SHALL then check the full merged data, not only
the submitted keys, excluding any group-container field. It SHALL
check that every field in the current step's visible-and-required set
has a defined value. `createProcessInstance` SHALL NOT run this check.

<!-- antislop: allow sentence-length -->
<!-- Every sentence below is at or under 20 words. The linter merges a
sentence that opens with a code span into the sentence before it, doubling
the counted length; see antislop-sentence-split-breaks-on-code-span.md. -->
Requiredness is a transition-time gate. It is checked whenever a step
is left via a manual path. It is not checked whenever an instance is
created at or rests on one. A declared `FieldDef.default` does not
satisfy this check. `createProcessInstance` applies `default` once, at
creation (see the sibling requirement above). `submitAndTransition`
never re-applies or re-checks it at a later transition.

#### Scenario: A type mismatch is rejected
- **WHEN** a submitted value does not match its field's declared type
- **THEN** the result carries a `type-mismatch` issue for that field

#### Scenario: A value outside a field's declared options is rejected
- **WHEN** a submitted value for a field with declared static `options` does
  not equal any `option.value`
- **THEN** the result carries an `invalid-option` issue for that field

#### Scenario: A value outside a dataSource-bound field's resolved options is rejected
- **WHEN** a submitted value for a `dataSource`-bound field does not equal
  any of that data source's resolved options' `value`
- **THEN** the result carries an `invalid-option` issue for that field

#### Scenario: A multiselect value is checked item-by-item against options
- **WHEN** a `multiselect` field declares `options` (static or
  `dataSource`-bound) and a submitted array includes an item not among the
  resolved options
- **THEN** the result carries an `invalid-option` issue for that field

#### Scenario: A constraint violation is rejected
- **WHEN** a submitted value violates an effective constraint (`min`, `max`,
  `minLength`, `maxLength`, or `pattern`)
- **THEN** the result carries a `constraint` issue naming the violated
  constraint for that field

#### Scenario: A step's narrowed bound rejects a value the catalog allows
- **WHEN** a catalog field declares `max: 10000`, the current step's view
  field overrides it with `max: 1000`, and a submission carries 5000
- **THEN** the result carries a `constraint` issue naming `max` for that
  field

#### Scenario: A step's widened bound accepts a value the catalog rejects
- **WHEN** a catalog field declares `max: 10000`, the current step's view
  field overrides it with `max: 20000`, and a submission carries 15000
- **THEN** the value passes the constraint check

#### Scenario: The same value is judged by the step it is submitted to
- **WHEN** two steps override one field's `max` differently and the same
  value is submitted to each
- **THEN** each submission is judged against the override of the step it was
  submitted to. Neither step's override affects the other

#### Scenario: A merge override leaves the catalog's other constraints in force
- **WHEN** a catalog field declares `min: 0` and `max: 10000`, the current
  step overrides `max` alone under the default mode. A submission carries
  a value below 0
- **THEN** the result carries a `constraint` issue naming `min`

#### Scenario: A replace override discards the catalog's other constraints
- **WHEN** a catalog field declares `min: 0` and `max: 10000`, the current
  step declares `validation: { max: 1000 }` with `validationMode: "replace"`,
  and a submission carries a value below 0
- **THEN** the value passes the constraint check, because `min` does not
  apply in that step

#### Scenario: A failing validation rule is rejected
- **WHEN** a field's effective `rule` CEL expression evaluates false against
  the merged data
- **THEN** the result carries a `rule-failed` issue for that field

#### Scenario: A step's rule supersedes the catalog's
- **WHEN** a catalog field declares a `rule` and the current step's view field
  declares a different `rule`
- **THEN** the step's rule is the only one evaluated for that field in that
  step

#### Scenario: A replace override drops the catalog rule entirely
- **WHEN** a catalog field declares a `rule`, and the current step declares
  `validation` without `rule` under `validationMode: "replace"`
- **THEN** no rule is evaluated for that field in that step

#### Scenario: A validation rule may reference the field's own submitted value
- **WHEN** a field's `validation.rule` references `data.<key>` for its own key
- **THEN** it is evaluated against the merged (not-yet-committed) data, so it
  sees the submitted value

#### Scenario: A missing required field is rejected on submission
- **WHEN** a `submitAndTransition` call's merged data has no defined value
  for a field in the current step's visible-and-required set
- **AND** that holds whether or not the field was included in the
  submission
- **THEN** the result carries a `required-missing` issue for that field

#### Scenario: A declared default does not satisfy a missing required field
- **WHEN** a visible-and-required field declares a `FieldDef.default` and has
  no defined value in the merged data at a `submitAndTransition` call
- **THEN** the result still carries a `required-missing` issue for that
  field. `submitAndTransition` never applies `default`; only
  `createProcessInstance` does, once, at creation

#### Scenario: createProcessInstance never enforces the required check
- **WHEN** `createProcessInstance` is called with `opts.data` omitting a
  field the initial step's view marks required
- **THEN** creation succeeds. The required check runs only on
  `submitAndTransition`, never on creation
