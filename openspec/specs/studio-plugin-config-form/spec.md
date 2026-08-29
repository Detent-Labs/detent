# studio-plugin-config-form Specification

## Purpose

A type picker and a generated form for three studio-area plugin positions:
action, data source, assignment strategy. Free-text type entry goes away
for those three, so a typo shows up before publish, not after.

## Requirements

### Requirement: A type picker replaces free-text type entry for a registry-backed position

The studio area SHALL offer a type picker for each action, data-source, and
assignment-strategy position. The picker SHALL list the live type names
`GET /registry` returns. It SHALL replace `PluginEnvelopeEditor`'s
free-text `type` input at those three positions.

#### Scenario: An author picks an action type from the registry

- **WHEN** a developer opens an action's plugin envelope editor
- **THEN** the type field offers only the action types `GET /registry`
  currently lists, not a free-text input

#### Scenario: The picker only offers registered types

- **WHEN** a developer opens the type picker for a data-source or
  assignment-strategy position
- **THEN** only the types listed in the matching `GET /registry` array
  appear as choices

### Requirement: A generated form replaces the raw JSON textarea for a schema-backed type

The `GET /registry` response may include a config-schema description for
the selected type. WHEN it does, the editor SHALL show one input per
schema property, instead of the raw JSON textarea. The form SHALL commit
the same `{ type, config }` shape the raw JSON path produces today.

#### Scenario: Selecting a schema-backed type shows a generated form

- **WHEN** a developer selects the built-in `static` assignment strategy,
  whose schema declares one `candidates: string[]` property
- **THEN** the editor shows a form field for `candidates`, not a JSON
  textarea

#### Scenario: The generated form's output matches the existing config shape

- **WHEN** a developer fills the generated form for the `static` assignment
  strategy
- **THEN** the committed config is a plain `{ candidates: [...] }` object,
  identical in shape to what the raw JSON textarea would have produced

### Requirement: An invalid field shows an inline error before publish

An invalid config value SHALL show an inline error immediately, at the
field it applies to. The editor SHALL NOT wait for the developer to
publish first.

#### Scenario: An inline error appears for an invalid field

- **WHEN** a developer enters a non-array value for a `candidates` field
  the schema declares as `string[]`
- **THEN** the editor shows an error next to that field before publish

#### Scenario: A valid form shows no error

- **WHEN** every field in the generated form satisfies the selected type's
  schema
- **THEN** the editor shows no inline error for that plugin envelope

### Requirement: A type with no declared config schema keeps the raw JSON path

A type with no declared config schema keeps its raw JSON path. The editor
SHALL fall back to the raw JSON textarea for that type's config. This
matches today's behavior exactly.

A type WITH a declared config schema still falls back to the raw JSON
textarea in one case. The schema, or a property inside it, then uses a
construct the generated form cannot show. Eight such constructs exist:

- a record-valued property (an open-ended set of keys, each sharing one
  value type)
- a nested object property
- a property with no declared type (accepts any value)
- a string property with a declared format other than `email`
- a string property constrained by a pattern (a regular expression, or a
  required prefix or suffix)
- a numeric property whose bound is exclusive rather than inclusive
- a numeric property constrained to a multiple of a given number
- an array-valued property whose elements are not strings and not a fixed
  string enum (numbers, booleans, or nested objects)

Any one of these, anywhere in the schema, drops the descriptor for the
WHOLE type. Every other property of that type falls back to the raw JSON
textarea alongside it. The fallback is not limited to the one property
carrying the unsupported construct.

#### Scenario: A schema-less type still accepts arbitrary JSON

- **WHEN** a developer selects a registered type that declares no config
  schema
- **THEN** the editor shows the raw JSON textarea for that type's config

#### Scenario: A record-valued property sends the whole type to raw JSON

- **WHEN** a developer selects a registered type whose config schema
  declares a record-valued property
- **THEN** the editor shows the raw JSON textarea for that type's config,
  covering every property of that type

#### Scenario: A nested object property sends the whole type to raw JSON

- **WHEN** a developer selects a registered type whose config schema
  declares a property that is itself a nested object
- **THEN** the editor shows the raw JSON textarea for that type's config,
  covering every property of that type

#### Scenario: An untyped property sends the whole type to raw JSON

- **WHEN** a developer selects a registered type whose config schema
  declares a property with no declared type
- **THEN** the editor shows the raw JSON textarea for that type's config,
  covering every property of that type

#### Scenario: A non-email string format sends the whole type to raw JSON

- **WHEN** a developer selects a registered type whose config schema
  declares a string property with a format other than email
- **THEN** the editor shows the raw JSON textarea for that type's config,
  covering every property of that type

#### Scenario: A pattern-constrained string property sends the whole type to raw JSON

- **WHEN** a developer selects a registered type whose config schema
  declares a pattern-constrained string property
- **THEN** the editor shows the raw JSON textarea for that type's config,
  covering every property of that type

#### Scenario: An exclusive numeric bound sends the whole type to raw JSON

- **WHEN** a developer selects a registered type whose config schema
  declares a numeric property with an exclusive minimum or maximum
- **THEN** the editor shows the raw JSON textarea for that type's config,
  covering every property of that type

#### Scenario: A multiple-of-constrained numeric property sends the whole type to raw JSON

- **WHEN** a developer selects a registered type whose config schema
  declares a `multipleOf`-constrained numeric property
- **THEN** the editor shows the raw JSON textarea for that type's config,
  covering every property of that type

#### Scenario: A non-string array property sends the whole type to raw JSON

- **WHEN** a developer selects a registered type whose config schema
  declares an array property with non-string, non-enum elements
- **THEN** the editor shows the raw JSON textarea for that type's config,
  covering every property of that type

### Requirement: A config schema carrying a cross-field rule still yields a generated form

A registered type whose config schema carries a cross-field rule SHALL yield a
generated form. A type whose schema carries no such rule already does. The
editor SHALL NOT fall back to the raw JSON textarea for either.

The generated form checks per-field rules alone. It SHALL NOT report a
cross-field rule inline. Publish applies the cross-field rule, through the
registry check that already parses a config against its schema.

A form that reports no inline error can therefore still meet a publish error.
That is already true of every type the form covers, because the form describes
a schema rather than replacing it.

#### Scenario: A cross-field rule does not send the editor to raw JSON

- **WHEN** a developer selects a registered type whose config schema carries a
  cross-field rule over two properties
- **THEN** the editor shows one input per schema property, not the raw JSON
  textarea

#### Scenario: A per-field error still reports inline

- **WHEN** a developer enters a value that breaks a per-field rule on such a
  type
- **THEN** the editor shows an error next to that field before publish

#### Scenario: A cross-field rule reports at publish

- **WHEN** a developer fills the generated form so that every per-field rule
  passes and the cross-field rule fails
- **THEN** the editor shows no inline error, and publish rejects the definition
  with an error naming that plugin position

### Requirement: An author can switch a schema-backed field from the generated form to raw JSON

The editor SHALL offer a way to switch a schema-backed type's config to
the raw JSON textarea. The textarea SHALL be pre-filled with the form's
current value. This keeps the JSON escape hatch stage 27 requires reachable
from every authoring path, including a schema-backed one.

#### Scenario: Switching to JSON preserves the current config

- **WHEN** a developer switches a schema-backed plugin envelope from the
  generated form to the raw JSON textarea
- **THEN** the textarea shows the config the form currently holds,
  unchanged

### Requirement: Custom field-type editing keeps its current behavior

`FieldCatalogPanel`'s custom-field-type envelope SHALL keep its free-text
`type` input and raw JSON textarea. No registry backs that position (see
`studio-tools`). This capability does not extend to it.

#### Scenario: A custom field type still uses free-text entry

- **WHEN** a developer selects the custom option for a field's type
- **THEN** the editor still shows a free-text `type` input and a raw JSON
  textarea for that field, unchanged

### Requirement: A list over a fixed value set renders as pickers, not free text

A config schema may declare an array whose entries come from a fixed value
set. WHEN it does, `GET /registry` SHALL describe that property with its value
set attached. The editor SHALL then offer one checkbox per value, in place of
the free-text control an open-ended array gets.

A free-text array renders today as one text area holding newline-separated
values. It has no rows, so a picker cannot sit in one. The whole control
gives way instead.

Without this rule such a property falls outside the described subset. One
undescribable property drops the whole type's description. The editor then
shows the raw JSON textarea for every other property too. A
`notification.email` action would lose its generated form entirely.

The committed config SHALL stay a plain array of the chosen strings. That is
the same shape the raw JSON path produces.

A rule spanning two properties SHALL stay a publish check. The requirement "A
config schema carrying a cross-field rule still yields a generated form"
already sets that placement. So `notification.email` shows no inline error for
two empty recipient lists, and publish rejects that body.

#### Scenario: A fixed-value list shows one checkbox per value

- **WHEN** a developer selects `notification.email`, whose schema declares a
  `toActors` list over `candidate`, `claimant` and `starter`
- **THEN** the editor shows three labelled checkboxes for that property, and
  no free-text control

#### Scenario: The rest of the type keeps its generated form

- **WHEN** a developer selects a type declaring both a fixed-value list and
  ordinary string properties
- **THEN** the editor shows a generated form for every property, and no raw
  JSON textarea

#### Scenario: The committed shape is a plain array of strings

- **WHEN** a developer ticks two boxes in a fixed-value list
- **THEN** the committed config holds a plain array of those two strings

#### Scenario: A free-text list keeps its control

- **WHEN** a developer selects the built-in `static` assignment strategy,
  whose `candidates` list carries no fixed value set
- **THEN** the editor keeps its free-text control for that property

#### Scenario: Two empty recipient lists reach publish, not the form

- **WHEN** a developer leaves both `to` and `toActors` empty
- **THEN** the form shows no inline error for either one
- **AND** publish rejects the body with a located config-validation error

### Requirement: A purpose-built form serves the instance.query data source type

The generated form covers a flat schema. It shows one input per schema
property. An `"instance.query"` config nests a list of comparison objects. The
generator cannot express that shape, so it falls back to the raw JSON textarea.

The studio SHALL therefore ship a purpose-built form for the
`"instance.query"` data source type. That form SHALL take precedence over
both the generated form and the raw JSON fallback, for that type alone.

It SHALL commit the same `{ type, config }` shape the raw JSON path produces.
<!-- "authoring surface" is a reserved domain term (see CLAUDE.md: "an authoring surface is what the studio presents"), not a synonym for "show" elsewhere in this file. -->
<!-- antislop: allow synonym-rotation -->
Every authoring surface produces the same JSON definition, and this one is no
exception.

Every other type SHALL keep its current path. A type whose schema the
generator covers keeps the generated form. A type with no declared schema
keeps the raw JSON textarea.

#### Scenario: Selecting the instance.query type shows its own form
- **WHEN** a developer selects the `"instance.query"` data source type
- **THEN** the editor shows that type's purpose-built form, and neither the
  generated form nor the raw JSON textarea

#### Scenario: The form commits the ordinary envelope shape
- **WHEN** a developer fills the purpose-built form
- **THEN** the committed value is a plain `{ type, config }` object, identical
  in shape to what the raw JSON textarea would have produced

#### Scenario: Another data source type keeps its generated form
- **WHEN** a developer selects the `"db.list"` data source type
- **THEN** the editor shows the generated form, unchanged

### Requirement: The instance.query form picks references rather than accepting free text

The form SHALL offer a picker for the target process, drawn from the published
processes. After that pick, the form SHALL offer pickers for that process's
steps and for its fields. Those pickers SHALL draw from the union of every
published version's catalog and step set. This is deliberately broader than
the publish-time check's own union. That check scopes itself to versions
holding live instances (see `cross-process-validation`). Fetching the
narrower, live-instance-scoped union from the studio would need a new
endpoint.

That choice waits on design.md's own Open Questions section. A reference can
sit inside this broader union but outside the narrower one. The form does not
mark that reference stale. The publish-time check still reports it as a
finding.

Free-text entry of an id SHALL NOT be the primary path. An opaque id typed by
hand is the error the type picker already removed for a plugin `type`. The
same reasoning applies to a step id and a field id.

Each picker SHALL mark a reference the union does not carry. The publish-time
check reports such a reference rather than rejecting it, so the author needs to
see it while authoring.

A comparison row SHALL offer the target field, the operator, and a right side.
The right side SHALL offer a literal or a field of the process the author is
editing.

#### Scenario: Picking a process offers its steps
- **WHEN** a developer picks a target process in the form
- **THEN** the step picker offers that process's steps

<!-- Scenario headers stay byte-identical: the OpenSpec archive step matches them by exact text; "configuration" here is the data source's config object, not a synonym for "option" (a resolved FieldOption). -->
<!-- antislop: allow passive-voice synonym-rotation -->
#### Scenario: A stale reference is marked in the picker
- **WHEN** the configuration names a field id no published target version
  declares
- **THEN** the form marks that reference

#### Scenario: A comparison offers both right sides
- **WHEN** a developer adds a comparison row
- **THEN** the row offers a literal right side and a field of the process the
  author is editing

### Requirement: The raw JSON escape hatch stays open for the instance.query type

An author SHALL be able to switch the `"instance.query"` config from its
purpose-built form to the raw JSON textarea. A schema-backed type already
allows that switch.

The JSON view is the escape hatch for what no builder expresses, and it stays
first-class. A purpose-built form does not close it.

#### Scenario: An author switches the instance.query config to raw JSON
- **WHEN** a developer editing an `"instance.query"` config chooses the raw
  JSON path
- **THEN** the editor shows the textarea carrying that config, and accepts an
  edit to it
