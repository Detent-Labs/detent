## Purpose

A row builder over CEL at the studio's three condition sites. A business
analyst can then author a path guard, a view override, or a field's
cross-step `visible` condition without writing CEL. The builder reads an
existing condition back by parsing it. A hand-written guard and a built
one therefore stay one artifact.

## MODIFIED Requirements

### Requirement: The builder is the default surface at every condition site

The studio SHALL offer a row builder as the default editor for a path guard.
It SHALL offer the same builder for `visible`, `required` and `readonly`,
wherever the studio edits one. That includes the field catalog's Rules tab
"Only ask this when" row. That row edits a field's `visible` override
across every step view that references the field.

<!-- antislop: allow synonym-rotation -->
<!-- Why: "surface" is this capability's own noun for the raw-CEL escape
     hatch (the requirement header names it, and base spec's "The CEL
     surface stays reachable from every builder site" requirement does
     too). "show" is the unrelated verb for what the builder does with
     the CEL it produces. Not a rotated synonym. -->
Below the rows the builder SHALL show the CEL it produces, on a
read-only line.

That row's operand picker SHALL withhold `child.outcome` and
`child.data`. It writes one expression across steps of mixed type. "A
subprocess step offers the child's contract as operands" scopes those
operands to a site on the subprocess step itself. The row keeps the
CEL toggle presentation every view-override site takes.

A timer deadline is not a condition and keeps its text input.

#### Scenario: A path guard opens on the builder

- **WHEN** a developer opens a path's guard editor
- **THEN** the row builder appears, with the CEL it produces below it

#### Scenario: A view override opens on the builder

- **WHEN** a developer opens the `visible`, `required` or `readonly` override of
  a view field
- **THEN** the same row builder appears at that site

#### Scenario: The field catalog's condition row opens on the builder

- **WHEN** a developer opens "Only ask this when" on the field catalog's
  Rules tab
- **THEN** the same row builder appears, editing the `visible` override the
  row writes to every referencing step view

#### Scenario: A timer deadline keeps its text input

- **WHEN** a developer opens a timer's deadline expression
- **THEN** the plain CEL text input appears, unchanged
