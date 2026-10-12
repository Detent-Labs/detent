<!-- antislop: allow-file passive-voice synonym-rotation -->
<!-- A MODIFIED block copies its live requirement whole, as OpenSpec requires,
     so the live spec text carries these findings. Passive WHEN/THEN phrasing
     matches the convention of every existing spec.md in openspec/specs/. -->
# Spec Delta

## MODIFIED Requirements

### Requirement: The builder is the default surface at every condition site

The studio SHALL offer a row builder as the default editor for a path guard.
It SHALL offer the same builder for `visible`, `required` and `readonly`,
wherever the studio edits one. That includes the field catalog's
"Only ask this when" row, which sits in the Fields view's effect half. That
row edits a field's `visible` override across every step view that references
the field.

Below the rows the builder SHALL show the CEL it produces, on a
read-only line.

That row's operand picker SHALL withhold `child.outcome` and
`child.data`. It writes one expression across steps of mixed type. The
requirement "A subprocess step's path guards offer the child's contract as
operands" scopes those operands. Only a path guard on the subprocess step
itself offers them. The row keeps the CEL toggle presentation every
view-override site takes.

A timer deadline is not a condition and keeps its text input.

#### Scenario: A path guard opens on the builder

- **WHEN** a developer opens a path's guard editor
- **THEN** the row builder appears, with the CEL it produces below it

#### Scenario: A view override opens on the builder

- **WHEN** a developer opens the `visible`, `required` or `readonly` override of
  a view field
- **THEN** the same row builder appears at that site

#### Scenario: The field catalog's condition row opens on the builder

- **WHEN** a developer opens "Only ask this when" in the field catalog's
  effect half
- **THEN** the same row builder appears, editing the `visible` override the
  row writes to every referencing step view

#### Scenario: A timer deadline keeps its text input

- **WHEN** a developer opens a timer's deadline expression
- **THEN** the plain CEL text input appears, unchanged

## REMOVED Requirements

### Requirement: A subprocess step offers the child's contract as operands

**Reason**: The requirement offers the child's operands at the step's three view
overrides. The runtime resolves a view flag with no child in scope. A flag that
reads `child` is therefore always false, and the authoring check now rejects it.
A MODIFIED block cannot drop the base scenario "A view override on a subprocess
step reaches child too". A successor under a new name replaces this requirement.

**Migration**: Use "A subprocess step's path guards offer the child's contract as
operands". It keeps every operand at the path guard and withholds them at the
view overrides.

## ADDED Requirements

### Requirement: A subprocess step's path guards offer the child's contract as operands

A path guard on a subprocess step whose child resolved SHALL offer
`child.outcome`, carrying the child contract's declared outcomes as its values.
It SHALL also offer `child.data.<key>`, over the child contract's
`outputFields` alone. The authoring check types `child.data` against those
fields, so a key outside them would author a publish error.

The view overrides on that step (`visible`, `required` and `readonly`)
SHALL NOT offer these operands. The authoring check withholds `child` there,
because the runtime resolves a view flag with no child in scope.

When the child does not resolve, `child.outcome` SHALL fall back to a free-text
value at the path guard. No `child.data.<key>` operand SHALL appear then.

#### Scenario: A resolved child gives an outcome picker

- **WHEN** a developer authors a guard on a path leaving a subprocess step whose
  child resolved
- **THEN** `child.outcome` offers exactly the outcomes the child contract
  declares

#### Scenario: A view override on a subprocess step offers no child operand

- **WHEN** a developer opens a view field's `visible`, `required` or `readonly`
  override on that same subprocess step
- **OR** the developer opens a note's `visible` override
- **THEN** the picker offers neither `child.outcome` nor `child.data.<key>`

#### Scenario: Only the contract's output fields appear

- **WHEN** the child declares a field its contract omits from `outputFields`
- **THEN** no `child.data` operand names that field

#### Scenario: An unresolved child falls back to text

- **WHEN** the subprocess step's child did not resolve
- **THEN** `child.outcome` takes a free-text value at the path guard, and no
  `child.data` operand appears
