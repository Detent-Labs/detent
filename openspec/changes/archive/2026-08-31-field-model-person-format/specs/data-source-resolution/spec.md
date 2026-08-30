<!-- antislop: allow-file em-dash passive-voice sentence-length -->
<!-- The MODIFIED blocks below carry live-spec text verbatim, which the archive step matches by exact header, so its existing findings stay unrewritten. -->
## MODIFIED Requirements

### Requirement: A data-source-bound view field's options are resolved at runtime

<!-- antislop: allow sentence-length passive-voice -->
<!-- Paragraph carried from the main spec, including the dedup note in parentheses. -->
`resolveFields` (`src/runtime/api.ts`) SHALL accept a `registry:
DataSourceRegistry` parameter and, for each view field whose `FieldDef`
declares `dataSource`, resolve the referenced `DataSourceDef` from
`body.dataSources`, look up its handler in `registry` by `type`, call
`resolve({ config: def.config, heldValues, instance })`, and attach the
result. `heldValues` SHALL carry the values the instance holds for that field:
none when the field is unset, one for a `string` field, and the whole array
for a `list` field. `instance` SHALL carry the instance whose view or
submission is resolving, with its `id`, its `processId`, its current `data`,
and its process's `baseLocale`. Each view
field resolves through its own `resolve` call. Two
fields on the same step bound to the same data source and holding the same
values each trigger their own call; neither call's result is shared with the
other (`dedup-runtime-pagination-webhook-sink`: the per-call memoization this
requirement once described added 18 lines to dedupe a case `resolveFields`
does not hit in a hot loop, and was removed).

`instance.data` SHALL be the instance's committed data. A submission SHALL
resolve against the same data the view read resolved against. It SHALL NOT
resolve against the submitted payload merged over that data.

The renderer draws its option list before the participant submits anything, so
it resolves against committed data. Membership validation must check the list
the participant chose from. Resolving a submission against a merged payload
would check a different list.

A handler comparing against a reading-instance field therefore reads the value
that field held at step entry.

`heldValues` SHALL follow that same rule. Held means COMMITTED, so a value the
same call is seeding does not count. At creation the instance holds nothing,
so `heldValues` is empty there.

A view field whose `FieldDef` declares `format: "person"` and neither
`options` nor `dataSource` SHALL instead resolve its options from the
process body's own `allowedGroups` (`?? []`), in three layers:

- one option per group id in `allowedGroups`, `value` the group id and
  `label` that group's own name;
- one option per member account of those groups, `value` the user id and
  `label` that account's resolved display name, deduplicated across groups;
- one option per value the instance already holds for the field that the two
  layers above did not produce, so a member who has left the group or whose
  account is disabled does not strand the value the instance holds.

The resolved array SHALL carry those three layers in that order: every group
entry, then every member entry, then every held-value entry. Within the first
layer the order SHALL be `allowedGroups`'s own declared order. Within the
second it SHALL be each group's member order, groups taken in that same
declared order, with a member appearing in two groups keeping its first
position. `FieldOption[]` is ordered and the renderer draws it in array
order, so this is what a participant sees, not an internal detail.

Every `label` SHALL be keyed by the process body's `baseLocale`.
An option's `label` is `localizedText`, and neither an account nor a group
carries a per-locale name. Where no name resolves — a group id the store no
longer holds, a user id matching no account — the id itself SHALL be the
label, rather than the option being dropped.

`dataSource` stays orthogonal to `format` per the `definition-contract`
capability: a `person`-formatted field declaring `dataSource` resolves through
the ordinary `dataSource` branch above instead, unchanged by this rule.

`ResolvedViewField` SHALL gain an `options?: FieldOption[]` property,
populated from `field.options` when the field declares static options
unchanged, from the resolved data-source result when the field declares
`dataSource`, or from the `allowedGroups` expansion above for a
person-formatted field declaring neither. This is the single field
downstream code (view rendering, submission validation) SHALL read options
from, rather than reading `FieldDef.options` directly.

#### Scenario: A static-options field's resolved options are unchanged
- **WHEN** a view field's `FieldDef` declares `options` (not `dataSource`)
- **THEN** the resolved field's `options` equals that static `options` array

#### Scenario: A dataSource-bound field's resolved options come from its handler
- **WHEN** a view field's `FieldDef` declares `dataSource` referencing a
  `"static"` data source with configured options
- **THEN** the resolved field's `options` equals the result of that data
  source's `resolve` call

#### Scenario: Two fields sharing one data source each resolve it independently
- **WHEN** two view fields on the same step both declare the same
  `dataSource`, whether or not they hold the same values
- **THEN** the handler's `resolve` is invoked once per field, and each
  field's resolved `options` reflects its own call's result

#### Scenario: A field with neither options nor dataSource has no resolved options
- **WHEN** a view field's `FieldDef` declares neither `options` nor
  `dataSource`, and declares no `format: "person"`
- **THEN** the resolved field's `options` is `undefined`

#### Scenario: A retired value the instance holds stays submittable
- **WHEN** an instance holds a value that its data source no longer offers,
  and the participant submits the step without changing that field
- **THEN** the resolved options carry that value, and submission validation
  accepts it

<!-- Scenario bullets stay verbatim: the OpenSpec archive step matches this block by exact text. -->
<!-- antislop: allow passive-voice -->
#### Scenario: A submission resolves against the committed data
- **WHEN** a participant submits a step filling field G, and a data source
  compares against G
- **THEN** the resolution reads the value G held when the step was entered,
  not the submitted value

<!-- Scenario bullets stay verbatim: shortening the WHEN would drop its second precondition. -->
<!-- antislop: allow sentence-length -->
#### Scenario: The rendered list and the validated list agree
- **WHEN** a participant submits a value picked from the list the step's view
  read offered, and no other instance changed in between
- **THEN** submission validation resolves the same list, and accepts that
  value

#### Scenario: A bare person field's options come from allowedGroups
- **WHEN** a view field's `FieldDef` declares `{type: "string", format:
  "person"}` with neither `options` nor `dataSource`, and the process
  declares `"allowedGroups": ["group_finance"]` naming a group with members
  `["user_a", "user_b"]`
- **THEN** the resolved field's `options` holds one entry per member,
  `value` the member's user id and `label` the member's resolved display
  name, keyed by the body's `baseLocale`
- **AND** it also holds an entry whose `value` is `"group_finance"` and whose
  `label` is that group's own name
- **AND** that group entry comes first in the array, ahead of both member
  entries

#### Scenario: A held value survives its account leaving the group

- **WHEN** an instance holds `"user_b"` for a bare person field, and
  `user_b` is no longer a member of any group the body's `allowedGroups`
  names
- **THEN** the resolved field's `options` still carries an entry whose
  `value` is `"user_b"`, so submitting the step without changing that field
  passes membership validation

#### Scenario: A person field fails closed with no declared group

- **WHEN** a view field's `FieldDef` declares `format: "person"` with
  neither `options` nor `dataSource`, and the process declares no
  `allowedGroups`
- **THEN** the resolved field's `options` is an empty array, not every
  account in the system

#### Scenario: A dataSource-bound person field resolves through the ordinary dataSource branch

- **WHEN** a view field's `FieldDef` declares `{type: "string", format:
  "person", dataSource: "ds_directory"}`
- **THEN** the resolved field's `options` equals the result of that data
  source's own `resolve` call, and `allowedGroups` is not consulted

### Requirement: Submission validation enforces membership against resolved options, including data-source-bound fields

<!-- antislop: allow sentence-length -->
<!-- Paragraph carried from the main spec; the person sentences follow it. -->
`optionValuesValid` SHALL validate a submitted value against the field's
resolved `options` (as populated by `resolveFields`, covering both static and
data-source-bound fields) rather than reading `FieldDef.options` directly, so
a `dataSource`-bound field's submission is now checked for membership instead
of accepting any value.

This covers a `format: "person"` field declaring neither `options` nor
`dataSource` as well, with no separate rule: the requirement above populates
that field's `options`, and this check reads whatever was populated. A
submitted principal id the body never offered therefore draws an
`invalid-option` issue. That is the submit-side half of the boundary the
picker draws, so a participant cannot route a step to an account outside the
process's own `allowedGroups`.

One case places no bound: an empty resolved list. `optionValuesValid` reads
an empty `options` array the same way it reads an absent one and accepts any
value of the right shape. A body declaring no `allowedGroups` therefore gets
the `format` shape check alone on a bare person field, which is where every
person field stands before this change.

#### Scenario: A value within a data-source-resolved option list passes
- **WHEN** a submitted value for a `dataSource`-bound field equals one of its
  resolved options' `value`
- **THEN** the submission passes option-membership validation for that field

#### Scenario: A value outside a data-source-resolved option list is rejected
- **WHEN** a submitted value for a `dataSource`-bound field does not equal
  any of its resolved options' `value`
- **THEN** the result carries an `invalid-option` issue for that field,
  matching the existing behavior for a static-`options` field

#### Scenario: A person id outside the allowedGroups expansion is rejected

- **WHEN** a body declares `"allowedGroups": ["group_finance"]`, and a
  participant submits `"user_z"` for a bare person field, where `user_z`
  belongs to no group that list names
- **THEN** the result carries an `invalid-option` issue for that field

#### Scenario: A declared group id is submittable through a person field

- **WHEN** a body declares `"allowedGroups": ["group_finance"]`, and a
  participant submits `"group_finance"` for a bare person field
- **THEN** the submission passes option-membership validation for that field,
  and `org.actor-from-field` resolves it through its own `group_` branch

#### Scenario: An empty resolved list places no membership bound

- **WHEN** a body declares no `allowedGroups`, and a participant submits
  `"user_a"` for a bare person field whose resolved `options` is empty
- **THEN** the submission passes option-membership validation, and the
  `format` shape check is the only rule the value faces
