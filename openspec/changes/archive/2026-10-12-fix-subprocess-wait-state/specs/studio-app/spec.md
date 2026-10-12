<!-- antislop: allow-file negation-habit trailing-negation -->
<!-- A MODIFIED block copies its live requirement whole, as OpenSpec requires,
     so the live spec text carries these findings. Passive WHEN/THEN phrasing
     matches the convention of every existing spec.md in openspec/specs/. -->
# Spec Delta

## MODIFIED Requirements

### Requirement: The Fields view's effect half states usage, a condition and requiredness

"Column mapping" SHALL show in the effect half only when the field's
data source is mappable, per the existing `showsColumnMapping` rule.
Its absence draws no rule of its own. It sits in the effect half
because a column mapping writes into other fields. That is effect, not
definition.

"Used in" SHALL list every step whose view references the field, with
the modes those references set. A "Show on the canvas" control on a row
SHALL return to the canvas with that step preselected.

"Only ask this when" is a third condition-builder site, alongside the
path guard and the view-override sites `studio-condition-builder`
already names. It SHALL read the `visible` overrides of every step
view that references the field. When those views disagree, the row
SHALL state that plainly. A `visible` override is `boolean` or an
expression. The row edits expressions alone. A referencing view holding
a literal SHALL therefore count as a disagreement, and the row SHALL
name it.

When no step view references the field, the row SHALL show disabled.
It SHALL state that no step asks for it yet.

The row's operand picker SHALL withhold `child.*`. No `visible` override
admits `child`: the runtime resolves the flag with no child in scope.

Updating the condition SHALL write the same override to every
referencing view, and SHALL name the write before it happens. Where a
referencing view holds a literal, the notice SHALL name that step.
Clearing the condition SHALL drop the `visible` key from every
referencing view. It SHALL name that scope before it happens, on the
same terms a write does. The field SHALL NOT store a field-level
condition.

"Ask for this" SHALL read and write the `required` override of every
step view that references the field. The catalog declares no `required`
key of its own, so this control writes the view and never the field.
That is the definition contract's own rule, and this control does not
bend it.

When those views disagree, the row SHALL state that plainly and name
the differing step. Updating SHALL name the write before it happens,
on the same terms the condition row takes. A technical field SHALL show
the row disabled, since `technical` already forces `required: false` on
every step. A field no step view references SHALL show it disabled too.

#### Scenario: A mappable field shows Column mapping in the effect half

- **WHEN** the developer opens the Fields view on a field whose data
  source is mappable
- **THEN** "Column mapping" shows in the effect half, ruled apart from
  its neighbour

#### Scenario: An unmappable field shows no Column mapping zone

- **WHEN** the developer opens the Fields view on a field whose data
  source is not mappable
- **THEN** no "Column mapping" heading renders, and its neighbour draws
  no rule below it for a zone that isn't there

#### Scenario: Used in lists steps and modes

- **WHEN** a field's ref appears in two step views, one with
  `required` and one with `readonly`
- **THEN** the usage list names both steps and both modes

#### Scenario: A condition writes every referencing view

- **WHEN** the developer sets "Only ask this when" on a field that
  two step views reference
- **THEN** both views carry the same `visible` override, and the row
  named both steps before the write

#### Scenario: Clearing the condition names its scope

- **WHEN** the developer clears "Only ask this when" on a field that
  two step views reference
- **THEN** the row named both steps before the clear, and neither view
  carries a `visible` key afterwards

#### Scenario: The condition row names diverging views

- **WHEN** one referencing view carries a different `visible`
  override than the others
- **THEN** the condition row says so and names the differing step

#### Scenario: A literal override counts as a disagreement

- **WHEN** one referencing view carries `visible: false` and another
  carries an expression
- **THEN** the condition row says the views disagree and names the step
  holding the literal
- **AND** the write notice names that step too

#### Scenario: The condition row offers no child operand

- **WHEN** the developer opens "Only ask this when" on a field a
  subprocess step's view references
- **THEN** the operand picker offers the catalog and the instance and
  actor context, and it offers no `child.outcome` or `child.data` entry

#### Scenario: An unreferenced field disables the condition row

- **WHEN** the developer opens "Only ask this when" on a field no step
  view references
- **THEN** the row shows disabled and states that no step asks for
  the field yet

#### Scenario: Ask for this writes every referencing view

- **WHEN** the developer turns "Ask for this" on for a field that two
  step views reference
- **THEN** both views carry `required: true`, and the row named both
  steps before the write

#### Scenario: Ask for this names disagreeing views

- **WHEN** one referencing view carries `required: true` and another
  carries no `required` key
- **THEN** the row says the views disagree and names the differing step

#### Scenario: A technical field disables Ask for this

- **WHEN** the developer selects a field carrying `technical: true`
- **THEN** "Ask for this" shows disabled, and the draft's view entries
  keep no `required` key
