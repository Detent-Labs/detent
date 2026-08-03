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

#### Scenario: A schema-less type still accepts arbitrary JSON

- **WHEN** a developer selects a registered type that declares no config
  schema
- **THEN** the editor shows the raw JSON textarea for that type's config

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
