<!-- antislop: allow-file em-dash passive-voice sentence-length -->
<!-- The MODIFIED blocks below carry live-spec text verbatim, which the archive step matches by exact header, so its existing findings stay unrewritten. -->
## MODIFIED Requirements

### Requirement: Submitted data is validated against field type, options, constraints, and rule

For every field key present in a submission, `submitAndTransition` (and
`createProcessInstance`'s `opts.data` seed) SHALL validate the submitted
value, against the merged (not-yet-committed) data, in this order:

1. A type match against the field's declared `FieldDef.type`, mirroring the
   catalog's CEL-type mapping: `string` requires a JS `string`; `number` a JS
   `number`; `boolean` a JS `boolean`; `list` an array of strings; `file` and a
   plugin (object) type are opaque and accepted as-is. Where the field also
   declares a `format`, the value SHALL satisfy that format's value domain
   too. The `definition-contract` capability states each domain. A value
   failing either half carries a `type-mismatch` issue. That issue's
   `expected` names the format where the field declares one, and the JS shape
   otherwise.
2. If the field's resolved `options` is non-empty — populated from static
   `FieldDef.options`, or from a `dataSource`-bound field's runtime-resolved
   options, per the `data-source-resolution` capability — the value (each
   item, for a `list` field) must equal one resolved option's `value`.
3. Its effective constraints (`min`, `max`, `minLength`, `maxLength`,
   `pattern`).
4. If present, its effective `rule` CEL expression, evaluated with total
   (`evalGuard`-style) semantics against `buildGuardContext(body,
   mergedInstance, actor)` — the identical context `check.ts` type-checks a
   catalog field's `rule` against (no `result`, no `child`). A rule
   referencing the field's own value does so via `data.<key>`, like any
   other guard.

The format half of step 1 SHALL run wherever the type half runs. The outbox's
writeback check of a handler's `Action.output` value reads the same rule. A
handler therefore cannot write a value a participant could not submit.

The effective validation for a field in a step is the catalog field's
`validation` when the step's matching `view.fields[]` entry declares no
`validation`. When it declares one, per the `definition-contract` capability,
the effective validation overlays the catalog's keys with the step's under
`merge` (the default). Under `replace` it takes the step's alone. The step's
entry is the one whose `ref` names the field. Nothing else about the order or
the reported issues changes. An effective constraint is checked and reported
the way a catalog constraint always was.

Then, over the full merged data (not only the submitted keys, and excluding
any group-container field), `submitAndTransition` — but not
`createProcessInstance` — SHALL check that every field in the current step's
visible-and-required set has a defined value. Requiredness is a
transition-time gate: it is checked whenever a step is left via a manual
path, not whenever an instance is created at or rests on one. A declared
`FieldDef.default` does not satisfy this check. `createProcessInstance`
applies `default` once, at creation (see the sibling requirement above).
`submitAndTransition` never re-applies or re-checks it at a later
transition.

#### Scenario: A type mismatch is rejected
- **WHEN** a submitted value does not match its field's declared type
- **THEN** the result carries a `type-mismatch` issue for that field

#### Scenario: A value the declared format refuses is rejected
- **WHEN** a submitted value for a `{type: "string", format: "date"}` field is
  a string that is not a calendar date
- **THEN** the result carries a `type-mismatch` issue for that field, whose
  `expected` reads `date`

#### Scenario: A fractional value for an integer field is rejected
- **WHEN** a submitted value for a `{type: "number", format: "integer"}` field
  carries a fractional part
- **THEN** the result carries a `type-mismatch` issue for that field, whose
  `expected` reads `integer`

#### Scenario: A field declaring no format keeps its type check alone
- **WHEN** a submitted value for a `{type: "string"}` field is any JS string
- **THEN** the value passes the type check, whatever its content

#### Scenario: A handler writeback faces the same format check
- **WHEN** an action's `output` writes a value a field's declared `format`
  refuses
- **THEN** the writeback drops that target, exactly as it drops a value the
  declared type refuses

#### Scenario: A value outside a field's declared options is rejected
- **WHEN** a submitted value for a field with declared static `options` does
  not equal any `option.value`
- **THEN** the result carries an `invalid-option` issue for that field

#### Scenario: A value outside a dataSource-bound field's resolved options is rejected
- **WHEN** a submitted value for a `dataSource`-bound field does not equal
  any of that data source's resolved options' `value`
- **THEN** the result carries an `invalid-option` issue for that field

<!-- Scenario title stays verbatim: the OpenSpec archive step matches this block by exact title. -->
#### Scenario: A multiselect value is checked item-by-item against options
- **WHEN** a `list` field declares `options` (static or `dataSource`-bound)
  and a submitted array includes an item not among the resolved options
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
  for a field in the current step's visible-and-required set, whether or not
  that field was included in the submission
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
