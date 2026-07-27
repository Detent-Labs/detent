## ADDED Requirements

### Requirement: Select and multiselect share one option-list rendering

`FieldInput`'s `select` and `multiselect` branches SHALL build their
`<option>` elements from `field.options` through one shared expression,
not two independently-maintained copies of the same map. Every option's
key, value, and label text SHALL be unchanged from pre-consolidation
behavior.

#### Scenario: A select field renders its resolved options

- **WHEN** `FieldInput` renders a `select` field with `field.options` set
  (statically or via a resolved `dataSource`)
- **THEN** the rendered `<select>` contains a leading blank option plus one
  `<option>` per entry in `field.options`, each keyed and valued by
  `o.value` and labeled by `firstLocalizedText(o.label) || o.value`

#### Scenario: A multiselect field renders its resolved options

- **WHEN** `FieldInput` renders a `multiselect` field with `field.options`
  set
- **THEN** the rendered `<select multiple>` contains one `<option>` per
  entry in `field.options`, each keyed and valued by `o.value` and labeled
  by `firstLocalizedText(o.label) || o.value`, with no leading blank
  option

### Requirement: Free-text-fallback types share the plain text-input branch

A field whose type is `reference`, `file`, a plugin envelope, or the plain
`BaseFieldType` `string` SHALL render through one shared text-input
branch, not two independently-maintained copies of the same
`<input type="text">`.

#### Scenario: A reference, file, or plugin-typed field renders as free text

- **WHEN** `FieldInput` renders a field of type `reference`, `file`, or a
  `Plugin` envelope
- **THEN** it renders a plain `<input type="text">` wired to the field's
  value and `onChange`, identical to pre-consolidation behavior

#### Scenario: A plain string field renders the same way

- **WHEN** `FieldInput` renders a field of type `string`
- **THEN** it renders the same `<input type="text">` shape as a
  free-text-fallback field, through the same code path
