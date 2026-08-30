<!-- antislop: allow-file em-dash passive-voice sentence-length paragraph-length run-ons synonym-rotation -->
<!-- The MODIFIED blocks below carry live-spec text verbatim, which the archive step matches by exact header, so its existing findings stay unrewritten. -->
## MODIFIED Requirements

### Requirement: Resolve a display-ready view of an instance

`getInstanceView(instanceId, actor, registry, db?)` SHALL return an
`InstanceView` describing the instance's current step, its resolved
fields, and its currently available manual paths, for an instance in
any status. This read uses the ordinary (unlocked) rehydrate path. A
view is read-only, so there is no concurrent writeback for it to race.
`getInstanceView` SHALL take a required `registry: DataSourceRegistry`
parameter, threaded into the `resolveFields` call that resolves the
current step's view.

`getInstanceView` SHALL authorize `actor` against the loaded instance
before returning anything, per the `authorization` capability's
relationship rule (`ADMIN_ROLE`, or `startedBy`, or current claimant,
or eligible candidate on the current step), throwing
`AuthorizationError` otherwise. `actor` is therefore load-bearing
twice: as the authorization subject, and as the CEL guard context
`resolveFields`/`resolveAvailablePaths` evaluate against. For a caller
without `ADMIN_ROLE`, a failure to load the instance SHALL surface as
that same `AuthorizationError`, so an unrelated caller cannot
distinguish a nonexistent instance from one they may not read. A
caller holding `ADMIN_ROLE` SHALL see the ordinary not-found failure.

When the loaded instance is a test instance (`kind: "test"`, per the
`draft-test-instances` capability), the relationship rule narrows. The
rule SHALL authorize a non-administrative actor only as that test
instance's own `startedBy`. For an ordinary instance, the current step's
claimant or an eligible assignment candidate can read it directly. A test
instance's non-administrative actor SHALL NOT rely on that standing
alone.

This narrowing lets the actor who created a test instance view and drive
it. The `draft-test-instances` capability's studio-only creation route
stamps `startedBy` from the authenticated actor. The caller cannot
supply it. A different actor who merely holds a claim or candidacy on
the test instance cannot read it. That same standing would grant access
to an ordinary instance's real assignment holder. The `ADMIN_ROLE` role
continues to authorize access to a test instance exactly as it does to
an ordinary one.

`fields` SHALL contain exactly the current step's `ViewField`s whose
resolved `visible` (literal `boolean`, used as-is, or CEL, evaluated
with total semantics, default `true`) is `true` against
`buildGuardContext(body, instance, actor)`. Each entry carries its
resolved `required`, `readonly`, `span`, and `options`, per the
`data-source-resolution` capability. That capability names three sources
for `options`. Static `FieldDef.options` carries through unchanged. A
`dataSource`-bound field resolves its own at runtime. A field declaring
`format: "person"` and neither of those resolves the body's own
`allowedGroups` expansion. A field resolving invisible SHALL be
omitted entirely, not included with a flag. `span` SHALL be the
matching `ViewField.span`, or `1` when the view declares none.

`InstanceView` SHALL also carry `columns`: the current step's
`view.columns`, or `1` when the view declares none. `columns` reports
regardless of `status`, the same way `step` itself does, since it
describes the step's declared layout rather than instance state.

`InstanceView` SHALL also carry `kind` (`"published"` or `"test"`),
mirroring the underlying instance's own `kind`. A caller then renders a
test instance distinctly with no separate lookup.

A `ViewField` whose `ref` resolves to a `FieldDef` of `type: "group"`
(a container, never a leaf value in `instance.data`) SHALL still
appear in `fields` when visible, so a caller can render its
label/grouping, but its `value` SHALL always be `undefined` and its
resolved `required` and `readonly` SHALL always be reported as `false`
regardless of the view's own declaration. It is never part of the
visible-and-required set the required check enforces, nor of the
visible-and-editable set `submitAndTransition` accepts.

A `ViewField` may resolve to a `FieldDef` declaring `technical: true`.
Such a `ViewField` SHALL always resolve `required` as `false` and
`readonly` as `true`, regardless of the view entry's declaration. The
definition contract already forbids a technical field's view entry from
declaring either key. This rule therefore only restates what the
resolved body already means.

Where a body declares `technical: true` on a `type: "group"` field, the
group rule wins: both flags resolve `false`. The compile pass rejects
that pair, so only an uncompiled body reaches it. Type alone keeps a
group ref out of the editable set, whatever `readonly` resolves to.

Such a `ViewField` is never part of the visible-and-required set. It is
also never part of the visible-and-editable set `submitAndTransition`
accepts.

`availablePaths` SHALL contain exactly the manual paths on the current
step whose guard currently holds against `buildGuardContext(body,
instance, actor)`. Paths that don't match are omitted, not flagged. A
guardless manual path is always included (`evalGuard` treats no guard
as satisfied). `availablePaths` SHALL be empty when the instance is
not `running`, when the current step has no manual paths, or when
every manual path's guard is false. `status` is always present, so a
caller can distinguish these cases.

#### Scenario: An unrelated actor is refused before any field resolves

- **WHEN** an authenticated actor with no relationship to the instance
  and no `ADMIN_ROLE` calls `getInstanceView`
- **THEN** it throws `AuthorizationError`, and no data source is
  resolved and no field value is read out

#### Scenario: A related actor reads the view unchanged

- **WHEN** the caller is the instance's starter, its current claimant,
  an eligible candidate on the current step, or holds `ADMIN_ROLE`
- **THEN** the view resolves exactly as it did before this requirement
  changed: same `fields`, same `availablePaths`

#### Scenario: An invisible field is omitted

- **WHEN** a step's view marks a field's `visible` expression false
  against the instance's current data
- **THEN** that field is absent from `fields`

#### Scenario: A group-container field never reports as required

- **WHEN** a step's view references a `FieldDef` of `type: "group"`
  and marks it `required: true`
- **THEN** the resolved field's `required` is `false` and its `value`
  is `undefined`, regardless of the view's declaration

#### Scenario: A technical field never reports as editable

- **WHEN** `getInstanceView` resolves a step's view entry naming a
  `FieldDef` declaring `technical: true`
- **THEN** the resolved field's `required` is `false` and its
  `readonly` is `true`

#### Scenario: A guarded manual path that fails its guard is omitted

- **WHEN** a manual path's guard evaluates false against the instance's
  current data
- **THEN** that path is absent from `availablePaths`

#### Scenario: A guardless manual path is always available

- **WHEN** a manual path on the current step carries no guard
- **THEN** it is present in `availablePaths` regardless of instance data

#### Scenario: View on a non-running instance still resolves

- **WHEN** `getInstanceView` is called for a `completed` or `cancelled`
  instance by an actor with a relationship to it
- **THEN** it returns the instance's `status` and its terminal step's
  resolved `fields`, with `availablePaths` empty

#### Scenario: View on a subprocess wait-state has no available paths

- **WHEN** `getInstanceView` is called for a `running` instance parked on
  a `subprocess` step
- **THEN** `status` is `"running"` and `availablePaths` is empty, since a
  subprocess step's paths are schema-enforced to be automatic, never
  manual

#### Scenario: A dataSource-bound field's view carries its resolved options

- **WHEN** `getInstanceView` is called for an instance parked on a step
  whose visible fields include one bound to a `dataSource`
- **THEN** that field's resolved `options` reflects the data source's
  resolved result, not an empty or undefined list

#### Scenario: A bare person field's view carries its allowedGroups-resolved options

- **WHEN** `getInstanceView` is called for an instance parked on a step
  whose visible fields include one declaring `format: "person"` and neither
  `options` nor `dataSource`
- **THEN** that field's resolved `options` reflects the body's own
  `allowedGroups` expansion, per the `data-source-resolution` capability

#### Scenario: A field's span defaults to 1

- **WHEN** a step's view references a field whose `ViewField` declares
  no `span`
- **THEN** the resolved field's `span` is `1`

#### Scenario: A view's columns default to 1

- **WHEN** a step's view declares no `columns`
- **THEN** `InstanceView.columns` is `1`

#### Scenario: A declared span and column count both resolve

- **WHEN** a step's view declares `columns: 2` and a field's
  `ViewField` declares `span: 2`
- **THEN** `InstanceView.columns` is `2` and that field's resolved
  `span` is `2`

#### Scenario: A test instance's view carries kind "test"

- **WHEN** `getInstanceView` resolves an instance whose `kind` is `"test"`
- **THEN** the returned `InstanceView.kind` is `"test"`

#### Scenario: A published instance's view carries kind "published"

- **WHEN** `getInstanceView` resolves an instance whose `kind` is
  `"published"`
- **THEN** the returned `InstanceView.kind` is `"published"`

#### Scenario: A test instance's own creator retains access

- **WHEN** the caller is a test instance's `startedBy` actor, holding no
  `ADMIN_ROLE`
- **THEN** `getInstanceView` resolves the view exactly as it would for
  that same actor on an ordinary instance they started

#### Scenario: A claimant who is not the creator is refused a test instance

- **WHEN** the caller is a test instance's current step's claimant or an
  eligible assignment candidate
- **AND** the caller is not that test instance's `startedBy` and holds no
  `ADMIN_ROLE`
- **THEN** `getInstanceView` throws `AuthorizationError`, the same
  refusal a caller with no relationship to the instance at all receives

#### Scenario: Administrative access to a test instance is unaffected

- **WHEN** the caller holds `ADMIN_ROLE`
- **THEN** `getInstanceView` resolves a test instance's view exactly as
  it resolves an ordinary instance's

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
   `FieldDef.options`, from a `dataSource`-bound field's runtime-resolved
   options, or from the `allowedGroups` expansion a `format: "person"` field
   declaring neither of those resolves, per the `data-source-resolution`
   capability — the value (each item, for a `list` field) must equal one
   resolved option's `value`.

   This item reads the resolved list alone. It never re-derives one from the
   value's own shape. A person id passes here on membership, not on its
   `user_`/`group_` prefix. Step 1 already checked that prefix.
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

#### Scenario: A value outside a bare person field's resolved options is rejected

- **WHEN** a submitted principal id for a field declaring `format:
  "person"` and neither `options` nor `dataSource` equals none of that
  field's `allowedGroups`-resolved options' `value`, and the body declares at
  least one `allowedGroups` entry
- **THEN** the result carries an `invalid-option` issue for that field

#### Scenario: An on-view person default outside the expansion fails creation

- **WHEN** `createProcessInstance` seeds a `format: "person"` field's
  literal `default`, that field is present in the initial step's resolved
  view, and the seeded value sits outside the body's own `allowedGroups`
  expansion
- **THEN** creation fails with an `invalid-option` issue for that field, since
  the seeded default faces the same resolved-options check step 2 states for
  a submitted value

#### Scenario: An off-view person default faces no membership check

- **WHEN** `createProcessInstance` seeds a `format: "person"` field's
  literal `default`, and that field is absent from the initial step's
  resolved view
- **THEN** the value faces its `type` and `format` checks alone, and no
  `invalid-option` issue
- **AND** the reason is the off-view rule the sibling creation requirement
  states. That rule reads the catalog entry's own static `options`. A bare
  person field declares none

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
