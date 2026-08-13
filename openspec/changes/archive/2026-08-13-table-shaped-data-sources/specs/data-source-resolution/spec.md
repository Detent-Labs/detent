## ADDED Requirements

### Requirement: A resolved option carries its attributes to the view

`ResolvedViewField.options` SHALL carry each option's `attributes` unchanged
from the handler that produced them. The resolution layer SHALL neither add an
entry nor drop one.

`InstanceView` SHALL therefore expose them, so a renderer shows what a row
carries without a second request.

Attributes SHALL take no part in option membership validation. A submission is
valid when its value names an offered option, whatever the attributes hold.

Attributes SHALL reach no CEL context. A data source stays invisible to CEL,
and `docs/decisions.md` keeps that deferral. An attribute becomes readable only
after the write-back lands it in an ordinary field. CEL then reads it as
`data.<key>`, like any other value.

#### Scenario: The view carries an option's attributes
- **WHEN** an actor reads the view of a step whose field binds a
  column-declaring list
- **THEN** each option of that field carries its attributes

#### Scenario: An attribute does not widen membership
- **WHEN** an actor submits a value that names no offered option
- **THEN** the submission fails with `invalid-option`, whatever any attribute
  holds

#### Scenario: A guard cannot read a data source
- **WHEN** an author writes a guard naming a data source
- **THEN** the publish fails, exactly as it does today
