## ADDED Requirements

### Requirement: A standalone boolean checkbox renders at its intrinsic size, flush left

A `boolean` field with no `control: "radio"` SHALL render its checkbox at
its intrinsic, unstretched size. The checkbox's left edge SHALL align with
its field label's left edge. This holds regardless of the row's available
width.

#### Scenario: A boolean field's checkbox aligns with its label in a narrow row

- **WHEN** a `boolean` field with no `control` renders in a one-column form
- **THEN** the checkbox's left edge aligns with its label's left edge

#### Scenario: A boolean field's checkbox does not drift right in a wide row

- **WHEN** a `boolean` field with no `control` renders in a row wide enough
  to stretch a same-position text input
- **THEN** the checkbox still renders at its intrinsic size
- **AND** its left edge still aligns with its label's left edge, unaffected
  by the row's width

#### Scenario: A grouped boolean or list checkbox keeps its current rendering

- **WHEN** a `boolean` field under `control: "radio"`, or a `list` field
  under `control: "checkboxes"`, renders its option inputs
- **THEN** each option's checkbox or radio input renders immediately before
  its own option text, unchanged from today
