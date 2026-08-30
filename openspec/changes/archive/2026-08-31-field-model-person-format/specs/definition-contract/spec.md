<!-- antislop: allow-file em-dash sentence-length synonym-rotation -->
<!-- The MODIFIED blocks below carry live-spec text verbatim, which the archive step matches by exact header, so its existing findings stay unrewritten. -->
## MODIFIED Requirements

### Requirement: A field declares a value form, and may declare a semantic format and an input control

`FieldDef.type` SHALL carry one of six value forms: `string`, `number`,
`boolean`, `list`, `file`, `group`. It MAY instead carry a plugin envelope, as
it does today. Each of the six maps to exactly one CEL type and one JS shape.
No two of them collapse onto one engine type.

A `list` holds strings. A list of another item type is not expressible in this
round.

`FieldDef` SHALL gain an optional `format`, carrying one of five members:
`date`, `datetime`, `integer`, `email`, `person`. A `format` states the
value's semantics. The engine checks every member twice: at publish for a
literal default, and at submission for a participant's value.

`FieldDef` SHALL gain an optional `control`, carrying one of three members:
`multiline`, `radio`, `checkboxes`. A `control` states the input form alone. No
reader outside the field renderer SHALL read it.

Each enum admits a fixed member set. A field type that no member covers uses
the plugin envelope instead. That envelope carries its own semantics in its
config. `control` sits at catalog level. A step's view entry SHALL NOT override
it.

An omitted `format` means the type's own value domain. An omitted `control`
means the default control for the type. A body declaring neither key therefore
renders exactly as it does today.

A `person`-formatted field's value carries the bare principal id alone —
`user_`-prefixed for one account or `group_`-prefixed for one group — never a
name snapshot. A display name resolves at read time, not from a value stored
in `instance.data`.

#### Scenario: A field declaring a type alone publishes

- **WHEN** an author publishes a body whose fields declare `type` and neither
  `format` nor `control`
- **THEN** the publish succeeds, and every field keeps the value domain and the
  control its type alone gives it

#### Scenario: A removed type member fails to parse

- **WHEN** a body declares a field of type `select`, `multiselect`, `date`,
  `datetime` or `reference`
- **THEN** the body fails to parse, naming that field's `type`

#### Scenario: A picker is a type plus an option source

- **WHEN** an author declares a `string` field carrying `options` and a `list`
  field carrying the same `options`
- **THEN** both publish, the first taking one option value and the second
  taking an array of them

#### Scenario: A person field declares its single or multi form by type

- **WHEN** an author declares `{type: "string", format: "person"}` and
  `{type: "list", format: "person"}`
- **THEN** both publish, the first taking one principal id and the second
  taking an array of them

#### Scenario: A submitted person value stores the bare id

- **WHEN** a participant picks a person from a person field's resolved
  option list and submits the step
- **THEN** `instance.data` holds that option's `value` — the bare
  `user_`-prefixed id string alone — and no object carrying a display name
  beside it

### Requirement: A field's type governs the format and control it may carry

The compile pass SHALL reject a body declaring a `format` or a `control` that
the field's own `type` does not allow. The rule reads one table:

| `type` | allowed `format` | allowed `control` |
|---|---|---|
| `string` | `date`, `datetime`, `email`, `person` | `multiline`, `radio` |
| `number` | `integer` | none |
| `boolean` | none | `radio` |
| `list` | `person` | `checkboxes` |
| `file` | none | none |
| `group` | none | none |

A field whose `type` is a plugin envelope allows neither key. Its semantics and
its rendering belong to the plugin, not to a closed member.

This is a publish-path check. An unbypassable check is the reason, per the
placement requirement this capability already states. The reported error SHALL
locate at the offending field's `format` or `control`.

#### Scenario: An integer format on a string field fails the publish

- **WHEN** a field declares `{type: "string", format: "integer"}`
- **THEN** the publish fails with a validation error locating that field's
  `format`

#### Scenario: A checkboxes control on a string field fails the publish

- **WHEN** a field declares `{type: "string", control: "checkboxes"}`
- **THEN** the publish fails with a validation error locating that field's
  `control`

#### Scenario: An allowed pair publishes

- **WHEN** a field declares `{type: "string", format: "date"}` and another
  declares `{type: "list", control: "checkboxes"}`
- **THEN** the publish succeeds

#### Scenario: A format on a plugin-typed field fails the publish

- **WHEN** a field whose `type` is a plugin envelope declares
  `format: "email"`
- **THEN** the publish fails with a validation error locating that field's
  `format`

#### Scenario: A person format on a boolean field fails the publish

- **WHEN** a field declares `{type: "boolean", format: "person"}`
- **THEN** the publish fails with a validation error locating that field's
  `format`

#### Scenario: A person format on a list field publishes

- **WHEN** a field declares `{type: "list", format: "person"}`
- **THEN** the publish succeeds

### Requirement: A literal default satisfies its field's declared format

The compile pass SHALL reject a body whose field declares a `format` and a
literal `FieldDef.default` that the format refuses. An author writes that
value, and it lands in `instance.data` at creation like a submitted one.

This check SHALL skip an `Expression` default. Its result type is the CEL
layer's business, and that layer reads no format.

Each format's value domain:

- `date`: a calendar date written `YYYY-MM-DD`, with a day the month holds.
- `datetime`: an ISO-8601 date and time, with an optional seconds part, an
  optional fractional part, and an optional zone offset.
- `integer`: a JSON number with no fractional part.
- `email`: an address the HTML email input accepts.
- `person`: a string starting with `user_` or `group_` for a `string` field;
  an array of such strings for a `list` field.

#### Scenario: A default the format refuses fails the publish

- **WHEN** a field declares `{type: "string", format: "date"}` and
  `default: "banane"`
- **THEN** the publish fails with a validation error locating that field's
  `default`

#### Scenario: An impossible calendar date fails the publish

- **WHEN** a `format: "date"` field declares `default: "2026-02-30"`
- **THEN** the publish fails with a validation error locating that field's
  `default`

#### Scenario: A CEL default passes this check

- **WHEN** a `format: "date"` field declares an expression default
- **THEN** this check reports nothing for it

#### Scenario: A person default with the wrong prefix fails the publish

- **WHEN** a `{type: "string", format: "person"}` field declares
  `default: "role_finance"`
- **THEN** the publish fails with a validation error locating that field's
  `default`

#### Scenario: A person-list default with one bad element fails the publish

- **WHEN** a `{type: "list", format: "person"}` field declares
  `default: ["user_a", "not-a-principal-id"]`
- **THEN** the publish fails with a validation error locating that field's
  `default`

### Requirement: A process declares which groups its steps may reference

`ProcessBody` SHALL carry an optional `allowedGroups` field, typed
`string[]`. It lists the group ids this process's steps may reference in
any assignment config. A body declaring no `allowedGroups` SHALL parse
successfully, with `allowedGroups` reading as `undefined`. The field is
optional, not defaulted, so a body predating it keeps its existing
`definitionHash` (see design.md's "`.optional()`, not `.default()`"
decision). Every reader of the compiled body treats an absent
`allowedGroups` as an empty list, via `?? []`. No reader treats a present
but empty `allowedGroups` any differently from an absent one.

`allowedGroups` names groups the `group-administration` capability's store
holds. The schema layer resolves no external store. The definition
contract itself SHALL NOT validate an entry against that store at parse
time. `group-scope-validation`'s publish-time check (a separate capability)
is where that resolution happens.

`allowedGroups` has a second reader. A `person`-formatted field declaring
neither `options` nor `dataSource` draws its candidate list from these
groups and their member accounts, per the `data-source-resolution`
capability, and a participant's submitted value is bound to that list.
Enlarging `allowedGroups` to widen a picker therefore also enlarges the set
of groups a step's assignment may name. The key is one list serving two
readers, not two lists that happen to share a name.

#### Scenario: A process with no allowedGroups parses successfully

- **WHEN** a process body declares no `allowedGroups` field
- **THEN** the process body parses successfully, and its `allowedGroups`
  reads as `undefined`

#### Scenario: A process declaring allowedGroups parses

- **WHEN** a process body declares `"allowedGroups": ["group_finance",
  "group_ops"]`
- **THEN** the process body parses successfully (subject to every other
  invariant)

#### Scenario: One list serves the picker and the assignment allowlist

- **WHEN** an author adds `"group_ops"` to `allowedGroups` so a person
  field's picker offers that group's members
- **THEN** a step declaring `{ "type": "org.group-members", "config": {
  "groupId": "group_ops" } }` also publishes, since the same list is what
  that check reads

## ADDED Requirements

### Requirement: A step's org.actor-from-field reference resolves to a field declaring format: person

The compile pass SHALL reject a step whose `assignment.strategy.type` is
`org.actor-from-field` when that step's `config.fieldId` does not resolve,
within the process's own recursive field set, to a field declaring
`format: "person"`. This covers both a `fieldId` naming no field at all and
one naming a field of any other type or format. The rejection SHALL name the
step and the offending `fieldId`.

This check takes the write-path placement under this capability's placement
rule, the same rule the sibling `org.group-members`/`allowedGroups` check
above already states. A hand-written body could satisfy
`publishedProcessBody` while carrying a step whose `org.actor-from-field`
reference names a field with no `format: "person"`. The invariant is
therefore one a hand-written body must not bypass. Without it, an author
pointing the strategy at any other field discovers the mistake only as an
empty candidate list at runtime, since resolution is total and substitutes
no fallback assignee.

#### Scenario: A reference to a person-formatted field publishes

- **WHEN** a process declares a field `field_approver` of `{type: "string",
  format: "person"}`, and a step declares `{ "type": "org.actor-from-field",
  "config": { "fieldId": "field_approver" } }`
- **THEN** the publish succeeds (subject to every other invariant)

#### Scenario: A reference to a field with no person format fails the publish

- **WHEN** a process declares a field `field_notes` of `{type: "string"}`
  with no `format`, and a step declares `{ "type": "org.actor-from-field",
  "config": { "fieldId": "field_notes" } }`
- **THEN** the publish fails with a validation error naming that step and
  `"field_notes"`

#### Scenario: A reference to a nonexistent field fails the publish

- **WHEN** a step declares `{ "type": "org.actor-from-field", "config": {
  "fieldId": "field_ghost" } }`, and no field `field_ghost` exists in the
  process
- **THEN** the publish fails with a validation error naming that step and
  `"field_ghost"`
