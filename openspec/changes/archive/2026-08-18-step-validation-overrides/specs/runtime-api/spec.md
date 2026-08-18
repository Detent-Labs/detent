## MODIFIED Requirements

### Requirement: Submitted data is validated against field type, options, constraints, and rule

For every field key present in a submission, `submitAndTransition` SHALL
validate the submitted value against the merged (not-yet-committed) data. The
same order applies to `createProcessInstance`'s `opts.data` seed:

1. A type match against the field's declared `FieldDef.type`, mirroring
   `check.ts::celType`'s existing mapping. The `string`, `date`, `datetime`,
   `select` and `reference` types need a JS `string`. The `number` type needs
   a JS `number`, and `boolean` a JS `boolean`. The `multiselect` type needs
   an array of strings. A `file` and a plugin (object) type are opaque and
   accepted as-is.
2. If the field's resolved `options` is non-empty, the value must equal one
   resolved option's `value`. For a `multiselect`, every item must. Resolved
   `options` come from static `FieldDef.options`, or from a `dataSource`-bound
   field's runtime-resolved options, per the `data-source-resolution`
   capability.
3. Its effective constraints (`min`, `max`, `minLength`, `maxLength`,
   `pattern`) for the step being submitted.
4. If present, the effective `rule` CEL expression for the step being
   submitted. It is evaluated with total (`evalGuard`-style) semantics against
   `buildGuardContext(body, mergedInstance, actor)`. That is the identical
   context `check.ts` type-checks a catalog field's `rule` against, with no
   `result` and no `child`. A rule referencing the field's own value does so
   via `data.<key>`, like any other guard.

The effective validation for a field in a step is the catalog field's
`validation` when the step's matching `view.fields[]` entry declares no
`validation`. When it declares one, the effective validation is the catalog's
keys overlaid by the step's under `merge` (the default). Under `replace` it is
the step's alone, per the `definition-contract` capability. The step's entry
is the one whose `ref` names the field. Nothing else about the order or the
reported issues changes. An effective constraint is checked and reported the
way a catalog constraint always was.

Then `submitAndTransition` SHALL check that every field in the current step's
visible-and-required set has a defined value. That check runs over the full
merged data, not only the submitted keys, and it excludes any group-container
field. The `createProcessInstance` entry point does not run it.

Requiredness is a transition-time gate. It is checked whenever a step is left
via a manual path. It is not checked when an instance is created at one or
rests on one. A declared `FieldDef.default` does not satisfy this check.
Nothing in the engine applies `default` anywhere today, and this change does
not add that.

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
- **WHEN** a catalog field declares `min: 0` and `max: 10000`, and the current
  step overrides `max` alone under the default mode. The submission carries a
  value below 0
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
  for a field in the current step's visible-and-required set. The field may or
  may not appear in the submission
- **THEN** the result carries a `required-missing` issue for that field

#### Scenario: A declared default does not satisfy a missing required field
- **WHEN** a visible-and-required field declares a `FieldDef.default` and has
  no defined value in the merged data at a `submitAndTransition` call
- **THEN** the result still carries a `required-missing` issue for that
  field, because nothing applies `default`

#### Scenario: createProcessInstance never enforces the required check
- **WHEN** `createProcessInstance` is called with `opts.data` omitting a
  field the initial step's view marks required
- **THEN** creation succeeds, because the required check runs only on
  `submitAndTransition`, never on creation

## ADDED Requirements

### Requirement: The initial step's overrides govern a seeded creation

`createProcessInstance`'s `opts.data` seed SHALL be judged against the
effective validation of the initial step. That is the step the seed resolves
against. The same terms govern a submission against the step it is submitted
to. A `replace` override on the initial step therefore governs creation as
fully as it governs a submission.

#### Scenario: A seed is judged against the initial step's override

- **WHEN** the initial step's view field overrides a catalog `max`. A
  `createProcessInstance` call then seeds `opts.data` with a value the
  override rejects but the catalog allows
- **THEN** creation fails with a `constraint` issue naming that field
