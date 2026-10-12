## MODIFIED Requirements

### Requirement: A live participant preview stands beside the form canvas

The form editor SHALL carry a preview of what a participant meets. In a
window wider than 80rem, the preview SHALL stand beside the form canvas, in
the editor's trailing pane. The requirement "The preview stands under the
canvas at 80rem and below" states where it stands in a narrower window.

The preview SHALL mount the same `packages/form-ui` renderer the Player mounts.
No second renderer SHALL exist for it. What an author reads in the preview is
therefore what a participant gets.

The preview SHALL follow the view's own column count and its label position.
It SHALL name the process and the step above the fields. Below the fields it
SHALL carry one control per manual path the step declares, taking each path's
own label. A step declaring only automatic paths SHALL carry one submit
control.

A manual path can carry a guard. The runtime offers its control only while
that guard holds. The preview has no instance data to test the guard against.
It SHALL still draw the control. It SHALL print a line under the controls that
names the path and its condition.

The line reads the path's label, then the condition in the words the canvas
edge uses. A guard the builder cannot read prints its CEL
text instead. A manual path with no guard SHALL get no line.

The preview SHALL take no keyboard focus and no pointer interaction. It carries
the `inert` attribute, so a screen reader passes over it. Every change in the
form canvas SHALL reach the preview at once, without a reload.

#### Scenario: The preview follows the view order

- **WHEN** an author moves a field above another in the form canvas
- **THEN** the preview prints the two fields in the new order

#### Scenario: The preview follows the column count

- **WHEN** an author sets the form to two columns
- **THEN** the preview lays its fields in two columns

#### Scenario: The preview names the manual paths

- **WHEN** the step declares two manual paths labelled "Approve" and "Reject"
- **THEN** the preview carries one control reading "Approve"
- **AND** the preview carries one control reading "Reject"

#### Scenario: A guarded manual path names its condition

- **WHEN** the step declares a manual path labelled "Approve" with the guard
  `data.amount > 1000.0`
- **THEN** the preview carries the control "Approve"
- **AND** a line under the controls names "Approve" and its condition in words

#### Scenario: An unguarded manual path gets no line

- **WHEN** the step declares a manual path with no guard
- **THEN** the preview prints no condition line for that path

#### Scenario: The preview takes no focus

- **WHEN** an author walks the form editor with the Tab key
- **THEN** the focus never lands inside the preview

#### Scenario: A required entry marks itself in the preview

- **WHEN** a view entry declares `required: true`
- **THEN** the preview marks that entry's label as required

