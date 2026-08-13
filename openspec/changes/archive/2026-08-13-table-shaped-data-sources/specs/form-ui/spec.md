## ADDED Requirements

### Requirement: A select option shows the attributes its row carries

The renderer SHALL append an option's attribute values to the text of that
option. It SHALL do so for a `select` field and for a `multiselect` field
alike. It SHALL render them in the order the `attributes` map holds. That is
the order the operator declared.

One visible separator SHALL stand between the label and the attributes, and
between each attribute and the next.

It SHALL render a number through the locale's own number formatter. It SHALL
render a boolean as its literal value, and a string unchanged.

A boolean needs no wording of its own. An `<option>` carries one text run. No
catalog lookup and no face change reaches inside it.

An option with no attributes SHALL render exactly as it does today. The
renderer SHALL therefore need no flag and no branch on the field.

The composed text is the option's accessible name. A native `<option>` carries
text alone. A screen reader therefore reads the row as one line, and the
keyboard behavior stays what the platform gives.

#### Scenario: An option shows its attributes
- **WHEN** a `select` field's option carries a label and two attributes
- **THEN** the option reads as the label, a separator, and both attribute
  values in declared order

#### Scenario: An option with no attributes reads as before
- **WHEN** an option carries no `attributes` key
- **THEN** the option reads as its label alone

#### Scenario: An unfilled attribute leaves no gap
- **WHEN** an option carries one attribute and its list declares two columns
- **THEN** the option reads as the label and that one value, with no empty
  segment

#### Scenario: A number prints through the locale formatter
- **WHEN** an option carries a number attribute and the locale is German
- **THEN** the value prints in that locale's own number format

#### Scenario: A boolean prints as its literal value
- **WHEN** an option carries a boolean attribute
- **THEN** the value prints as `true` or `false`, in every locale
