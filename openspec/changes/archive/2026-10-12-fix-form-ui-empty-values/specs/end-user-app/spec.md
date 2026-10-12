# Spec Delta

## ADDED Requirements

### Requirement: The task screen is read-only when it offers no submit

The task screen SHALL pass `formIsReadonly(view)` to `FieldForm` as `readonly`.
A case that is not running opens with every input disabled.
So does a running step with no available manual path.
The screen SHALL offer no Save control then, and `PathButtons` draws nothing.
An unclaimed task with an available path stays editable.

#### Scenario: A completed case opens read-only

- **WHEN** a participant opens a completed case from "Cases I started"
- **THEN** every input stays disabled
- **AND** the screen offers no Save control and no path button

#### Scenario: A wait-state without a manual path is read-only

- **WHEN** a participant opens a running case whose step has no available manual path
- **THEN** every input stays disabled and the screen offers no Save control

#### Scenario: A step with a path stays editable

- **WHEN** a participant opens a running case whose step has an available path
- **THEN** the non-readonly inputs accept input

### Requirement: A read-only form states its reason

When the form is read-only, the task screen SHALL put one muted note above the form.
The note takes the style of the form-draft notice.
It names the cause: a case that is not running, or a step with no available path.
The English and German catalogs each carry one whole sentence per cause.

#### Scenario: A case that is not running gets its note

- **WHEN** a participant opens a cancelled case
- **THEN** the note says the case is not running

#### Scenario: A step without a path gets its note

- **WHEN** a participant opens a running case whose step has no available manual path
- **THEN** the note says no action is available on this step yet

#### Scenario: An editable form has no note

- **WHEN** a participant opens a running case whose step has an available path
- **THEN** the screen has no read-only note

### Requirement: A saved form draft keeps a cleared field cleared

On open, the task screen SHALL seed an editable field from the draft if the draft has its key.
A draft value of `null` counts as a value.
The field stays cleared, and the committed value does not return.

#### Scenario: A draft that cleared a field restores it cleared

- **WHEN** a participant clears an optional field that holds 120, clicks Save, and reopens the task
- **THEN** the field is empty and 120 stays gone
- **AND** a submit from that state sends `null` for the field

#### Scenario: A field the draft omits keeps the committed value

- **WHEN** the saved form draft has no key for a field
- **THEN** the field seeds from the committed value
