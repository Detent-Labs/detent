## ADDED Requirements

### Requirement: A live participant preview stands beside the form canvas

The form editor SHALL carry a preview of what a participant meets. The preview
SHALL stand beside the form canvas, in the editor's trailing pane.

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

## MODIFIED Requirements

<!-- The heading repeats the live spec's wording verbatim, so a delta can match it. -->
<!-- antislop: allow synonym-rotation -->
### Requirement: The form editor opens as a full-screen routed page over the step's view

Two places open the form editor. The step page's Step form fields section
opens it for the step it holds. The Forms tab's card opens it for that card's
step. Both reach the same routed page at `edit/form/:stepId`.

The editor SHALL open as a full-screen routed page. It replaces the native
`<dialog>` this capability used before.

Leaving the editor SHALL return to the place the author came from. An author
who came from the Forms tab returns to the Forms tab. An author who came from
the step page returns to that step.

The editor SHALL write directly to the in-browser draft as the author works.
It offers no Save button of its own. The screen's existing Save, Discard and
Publish controls stay the only ones that persist.

Navigating away from the editor and back SHALL carry the same draft state a
re-opened modal would have carried. The editor's writes already land in the
draft on every change, so it needs no separate state-preservation step.

#### Scenario: Opening the editor shows the current form

- **WHEN** the developer opens the form editor for a step that already has
  view fields
- **THEN** the page renders those fields in their current order and layout

#### Scenario: Navigating away keeps every change

- **WHEN** the developer navigates away from the form editor after moving or
  adding a field
- **THEN** the draft keeps that change
- **AND** the screen's own Save, Discard and Publish controls still govern

#### Scenario: Returning to the editor shows the same state

- **WHEN** the developer navigates away from the form editor and back to it,
  without an intervening save
- **THEN** the page carries the same fields, in the same order, the developer
  left it in

#### Scenario: Leaving returns to the Forms tab

- **WHEN** the developer opens the form editor from a Forms tab card and then
  leaves it
- **THEN** the Forms tab is the open one
