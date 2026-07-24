## MODIFIED Requirements

### Requirement: Field rendering covers every BaseFieldType

The Player's field renderer SHALL render a usable input for every
`BaseFieldType`: `string`, `number`, `date`, and `datetime` as native text/
number/date/datetime-local inputs; `boolean` as a checkbox;
`select`/`multiselect` as a `select` built from `field.options` when
present — populated for both static `FieldDef.options` fields and
`dataSource`-bound fields alike, since `getInstanceView` now resolves
`options` for both, per the `data-source-resolution` capability; `group` as
a nested container housing the fields that carry its key in
`ResolvedViewField.group`. A field of type `reference`, `file`, or a
`Plugin` envelope type SHALL render as a free-text input, since no dedicated
widget, reference picker, or file upload exists in this preview tool — this
fallback no longer applies to a `select`/`multiselect` field solely because
it carries `field.dataSource` instead of static `field.options`.

#### Scenario: Every BaseFieldType renders without error
- **WHEN** the Player renders a step whose view includes at least one field
  of each `BaseFieldType`
- **THEN** every field renders a corresponding input with no rendering
  error

#### Scenario: A dataSource-bound field renders using its resolved options
- **WHEN** a `select` or `multiselect` field declares `field.dataSource`
  instead of `field.options`
- **THEN** the Player renders it as a `select` built from the field's
  resolved `options`, the same as a static-`options` field, with no free-text
  fallback or "not yet supported" note

#### Scenario: A group field nests its member fields
- **WHEN** a step view includes a `group` field and other fields whose
  `ResolvedViewField.group` names that group's key
- **THEN** the Player renders the member fields nested within the group's
  container, not flattened alongside it

#### Scenario: A readonly field's input is disabled
- **WHEN** a resolved view field has `readonly` set
- **THEN** the Player renders its input in a disabled state

#### Scenario: A required field displays a required marker
- **WHEN** a resolved view field has `required` set
- **THEN** the Player renders a visible marker on that field, with no
  client-side submission enforcement — requiredness is validated
  server-side by `submitAndTransition`
