# Spec Delta

## ADDED Requirements

### Requirement: A default value's expression stands in a Developer view

A field's Default value SHALL hold its CEL input in a closed "Developer
view" disclosure under the literal input. No "Edit as CEL" control SHALL
print. While the default is an expression, the note "A rule computes this
default." SHALL replace the literal input. The disclosure SHALL stand open
then. Clearing the CEL text SHALL drop the `default` key and bring
the literal input back.

#### Scenario: A literal default keeps the disclosure closed

- **WHEN** a `number` field carries `default: 100`
- **THEN** the value input reads 100 and a closed Developer view stands
  under it

#### Scenario: An expression default opens the disclosure

- **WHEN** a field carries `default: { lang: "cel", src: "data.a * 2.0" }`
- **THEN** the note "A rule computes this default." stands where the value
  input would
- **AND** the Developer view stands open with that source

#### Scenario: Clearing the expression restores the value input

- **WHEN** an author empties the Developer view's CEL input
- **THEN** the draft's field has no `default` key
- **AND** the value input returns

## MODIFIED Requirements

<!-- antislop: allow synonym-rotation -->
<!-- Why: the heading repeats the live spec's wording, which a MODIFIED block must match. -->
### Requirement: The builder is the default surface at every condition site

The studio SHALL offer a row builder as the default editor for a path guard.
It SHALL offer the same builder for `visible`, `required` and `readonly`,
wherever the studio edits one. That includes the field card's
"Only ask this when" row, which sits in its Asked on section. That
row edits a field's `visible` override across every step view that references
the field.

Below the rows the builder SHALL show the condition as a sentence. The
requirement "The builder reads the condition as a sentence" states it.

That row's operand picker SHALL withhold `child.outcome` and
`child.data`. It writes one expression across steps of mixed type. The
requirement "A subprocess step's path guards offer the child's contract as
operands" scopes those operands. Only a path guard on the subprocess step
itself offers them. The row keeps its CEL in the same Developer view every
site takes.

A timer deadline is not a condition and keeps its text input.

#### Scenario: A path guard opens on the builder

- **WHEN** a developer opens a path's guard editor
- **THEN** the row builder appears, with its sentence below it

#### Scenario: A view override opens on the builder

- **WHEN** a developer opens the `visible`, `required` or `readonly` override of
  a view field
- **THEN** the same row builder appears at that site

#### Scenario: The field catalog's condition row opens on the builder

- **WHEN** a developer opens "Only ask this when" in the field card's
  Asked on section
- **THEN** the same row builder appears, editing the `visible` override the
  row writes to every referencing step view

#### Scenario: A timer deadline keeps its text input

- **WHEN** a developer opens a timer's deadline expression
- **THEN** the plain CEL text input appears, unchanged
