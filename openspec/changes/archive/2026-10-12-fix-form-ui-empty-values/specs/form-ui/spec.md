# Spec Delta

## ADDED Requirements

### Requirement: A cleared control reports null

`FieldForm` SHALL call `onChange` with `null` when a participant clears a control that holds one scalar value.
That covers a `number` input, a text input of any format, a multiline input and a single select's empty option.
It SHALL NOT report `undefined` or `""` for a cleared control.
A `boolean`, a `list` and a radio group keep their own values.
An unchecked box is `false`, and a `list` with nothing picked is `[]`.

#### Scenario: Clearing a number reports null

- **WHEN** a participant empties a `number` input that held 120
- **THEN** `onChange` receives `null` for that field

#### Scenario: Clearing a date reports null

- **WHEN** a participant clears a `date` input
- **THEN** `onChange` receives `null`, not `""`

#### Scenario: Choosing the empty option reports null

- **WHEN** a participant picks the empty option of a single select
- **THEN** `onChange` receives `null`

#### Scenario: A null value renders as an empty control

- **WHEN** `values` has `null` for a text, number or select field
- **THEN** the control renders empty

### Requirement: The submit filter keeps a null value

`filterToEditable` SHALL keep a `null` value in its result.
A submission and a saved form draft then carry it.
The engine reads `null` as a cleared field.

#### Scenario: A cleared value survives the submit filter

- **WHEN** the form values have `null` for an editable field
- **THEN** `filterToEditable` returns the key with `null`

### Requirement: A readonly switch makes the whole form read-only

`FieldForm` SHALL accept a `readonly` prop.
When it is true, every control renders in the disabled state that a `readonly` view field already uses, group members included.
The tab strip stays operable, because a tab is navigation and has no value.

#### Scenario: The prop disables every control

- **WHEN** `FieldForm` renders with `readonly` true and one editable field of each type
- **THEN** every control renders disabled

#### Scenario: The tab strip stays operable

- **WHEN** a tabbed form renders with `readonly` true
- **THEN** the tab buttons stay enabled

### Requirement: A helper tells a consumer when the form is read-only

`form-ui` SHALL export `formIsReadonly(view)`.
It answers true when the view has no available path, or when its `status` is not `running`.
It answers false otherwise.
A consumer passes the answer to `FieldForm` as `readonly`.

#### Scenario: A view with no path is read-only

- **WHEN** `formIsReadonly` receives a running view whose `availablePaths` is empty
- **THEN** it answers true

#### Scenario: A finished case is read-only

- **WHEN** `formIsReadonly` receives a view whose `status` is `completed`, `cancelled` or `faulted`
- **THEN** it answers true

#### Scenario: A running view with a path is editable

- **WHEN** `formIsReadonly` receives a running view with one available path
- **THEN** it answers false

### Requirement: A zoned datetime value uses the local input format

A `datetime` field's input takes the `YYYY-MM-DDTHH:mm` form that `<input type="datetime-local">` reads.
When the stored value carries a zone (`Z` or a `±HH:MM` offset), `FieldForm` SHALL convert it to the browser's local time.
It SHALL NOT rewrite the stored value until the participant edits the field.
A value that the conversion cannot parse stays as it is.

#### Scenario: A UTC value appears as local time

- **WHEN** a `datetime` field holds `2026-10-10T12:30:00Z` and the browser zone is UTC+02:00
- **THEN** the input has the value `2026-10-10T14:30`

#### Scenario: A zoneless value stays unchanged

- **WHEN** a `datetime` field holds `2026-10-10T14:30`
- **THEN** the input has the value `2026-10-10T14:30`

#### Scenario: An untouched zoned value submits unchanged

- **WHEN** a participant submits a form without an edit to a zoned `datetime` field
- **THEN** the submission carries the stored zoned value

### Requirement: A tab announcement inserts the tab label as plain text

`tabSwitchAnnouncement` SHALL insert the tab label and the field count into the caller's sentence as plain text.
A label that holds `$&`, `$$` or `{count}` SHALL appear in the sentence as written.
One pass replaces both placeholders, so no inserted value gets searched again.

#### Scenario: A label with a replacement pattern

- **WHEN** the tab label is `Kosten $&` and the sentence reads `Opened the {tab} tab. {count} fields still need an entry.`
- **THEN** the announcement reads `Opened the Kosten $& tab. 2 fields still need an entry.`

#### Scenario: A label that holds a placeholder

- **WHEN** the tab label is `{count}` and the field count is 2
- **THEN** the announcement shows the label as `{count}` and the count as `2`

### Requirement: form-ui declares the React major the product ships

`packages/form-ui` SHALL declare `react` and `react-dom` peers at `^19`, the major that `packages/web` depends on.
The form-ui tests SHALL run with that major.

#### Scenario: The peer range matches the consumer

- **WHEN** a reader compares the manifests of `packages/form-ui` and `packages/web`
- **THEN** both declare `react` and `react-dom` at `^19`

#### Scenario: The tests load React 19

- **WHEN** a form-ui test imports `react`
- **THEN** the resolved version has major 19
