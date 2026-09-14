## MODIFIED Requirements

### Requirement: The form editor renders from compiled styles

The screen `screens/FormEditorScreen.tsx` SHALL render from compiled
component styles, reading `form-ui/tokens.stylex`. The rendered result SHALL
match the previous stylesheet declaration for declaration, apart from the
width at which the preview turns. The requirement "The preview stands under
the canvas at 80rem and below" states that width.

The "How it will look" preview has a two-column layout. It SHALL pick
its style from a parameterized style function, keyed on the column
count. That is the same pattern `form-ui`'s own field renderer uses
for its own columns/span choice. The preview MAY still render a
`data-columns` fact on its container, for a test or another consumer
to read. No stylesheet SHALL select on it after migration.

#### Scenario: The form editor keeps its look

- **WHEN** a browser renders the form editor
- **THEN** its computed spacing, color and border equal the values the
  deleted stylesheet declared
- **AND** so does its layout, apart from the width at which the preview
  turns

#### Scenario: The two-column preview switches correctly

- **WHEN** an author toggles a field group between one and two columns
- **THEN** the preview's computed grid layout matches the deleted
  stylesheet's own two-column and one-column rules
- **AND** no compiled or hand-written stylesheet rule selects on a
  `data-columns` or `data-span` attribute after the migration

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

#### Scenario: The preview takes no focus

- **WHEN** an author walks the form editor with the Tab key
- **THEN** the focus never lands inside the preview

#### Scenario: A required entry marks itself in the preview

- **WHEN** a view entry declares `required: true`
- **THEN** the preview marks that entry's label as required

## ADDED Requirements

### Requirement: The preview stands under the canvas at 80rem and below

The form editor SHALL keep three columns only in a window wider than 80rem,
1280px. Those are the palette, the form canvas and the participant preview.

At 80rem and below, the preview SHALL leave its column. It SHALL stand under
the palette and the canvas, across both. The canvas then takes the width the
preview held. The 2px divider SHALL move from the preview's leading edge to
its top edge.

This width protects a field key on a card. In three columns at 1100px, a
card's key wrapped one character per line.

#### Scenario: Above 80rem the preview stands beside the canvas

- **WHEN** an author opens the form editor on IT Offboarding's "Submit the
  Exit Notification" step, in a window 1300px wide
- **THEN** the palette, the canvas and the preview stand in three columns
- **AND** the key `full_name` reads on one line on its card

#### Scenario: At 80rem the preview stands under the canvas

- **WHEN** the same form editor opens in a window 1280px wide
- **THEN** the palette and the canvas stand side by side
- **AND** the preview stands under both, with the 2px divider on its top
  edge alone

#### Scenario: A laptop window keeps a key on one line

- **WHEN** the same form editor opens in a window 1100px wide
- **THEN** the preview stands under the palette and the canvas
- **AND** the key `full_name` reads on one line on its card
