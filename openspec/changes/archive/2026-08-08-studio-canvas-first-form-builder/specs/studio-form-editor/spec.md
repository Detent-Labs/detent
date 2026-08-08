<!-- antislop: allow-file passive-voice -->
<!-- Why passive-voice: a scenario states an outcome, and the actor is the
     system under test. Matches this capability's own live spec. -->
## RENAMED Requirements

- FROM: `### Requirement: The form editor opens as a modal over the step's view`
- TO: `### Requirement: The form editor opens as a full-screen routed page over the step's view`
- FROM: `### Requirement: A left palette lists catalog fields not yet on the form`
- TO: `### Requirement: A left palette lists catalog fields not yet on the form, and offers minting a new one`

## MODIFIED Requirements

### Requirement: The form editor opens as a full-screen routed page over the step's view

`studio-canvas`'s selection-driven inspector opens the form editor for
the view entry (see the `studio-canvas` capability). The editor SHALL
open as a full-screen routed page, reached from the step inspector's
"Build the form" entry point. It replaces the native `<dialog>` this
capability used before.

The editor SHALL write directly to the in-browser draft as the author
works. It offers no Save button of its own. The screen's existing
Save/Discard/Publish toolbar remains the only control that persists.

Navigating away from the editor and back SHALL show the same draft
state a re-opened modal would have shown. The editor's writes already
land in the draft on every change; no separate state-preservation step
is needed.

#### Scenario: Opening the editor shows the current form

- **WHEN** the developer opens the form editor for a step that
  already has view fields
- **THEN** the page renders those fields in their current order and
  layout

#### Scenario: Navigating away keeps every change

- **WHEN** the developer navigates away from the form editor after
  moving or adding a field
- **THEN** the draft keeps that change, and the screen's own toolbar
  still governs Save/Discard/Publish

#### Scenario: Returning to the editor shows the same state

- **WHEN** the developer navigates away from the form editor and back
  to it, without an intervening save
- **THEN** the page shows the same fields, in the same order, the
  developer left it in

### Requirement: A left palette lists catalog fields not yet on the form, and offers minting a new one

The editor SHALL show every catalog field not currently referenced by
the step's view in a palette on the left. Dragging a placed-field entry
onto the canvas SHALL add it to the view, at the drop position.

The palette SHALL also offer an "add a field to the process" section, by
type. Dragging one of those entries onto the canvas SHALL mint a new
catalog field of that type. It SHALL add that field to the view, at the
drop position, in the same move.

A field already on the view SHALL NOT appear in the palette's
place-an-existing-field list. Removing a field from the canvas SHALL
return it to that list, if the field stays in the catalog.

#### Scenario: A field leaves the palette once placed

- **WHEN** the developer drags a palette field onto the canvas
- **THEN** that field appears on the canvas and no longer appears in
  the placed-an-existing-field list

#### Scenario: Removing a field returns it to the palette

- **WHEN** the developer removes a placed field from the canvas
- **THEN** that field reappears in the palette, and the view no longer
  references it

#### Scenario: Dropping an "add a field" entry mints and places a field

- **WHEN** the developer drags a "Text" entry from the "add a field to
  the process" section onto the canvas
- **THEN** a new catalog field of type `string` exists in the draft
- **AND** that field appears on the canvas at the drop position

#### Scenario: A minted field is reachable through the field catalog too

- **WHEN** a field is minted through the form editor's palette
- **THEN** that field appears in the process's field catalog, the same
  as a field minted through `EditPanelsModal`'s Fields tab

## ADDED Requirements

### Requirement: A "Developer view" disclosure holds two existing CEL and JSON escape hatches

A selected field's override strip already lets `visible`, `required`,
and `readonly` fall back to a CEL expression. That escape hatch SHALL
move behind a "Developer view" disclosure on the strip. It stays
reachable; it starts collapsed.

The process-field catalog panel already lets a custom field type carry
a raw JSON textarea for its plugin envelope. The
`studio-plugin-config-form` capability does not cover this position,
per its own carve-out. That escape hatch SHALL move behind its own
"Developer view" disclosure, on the same collapsed-by-default pattern.

Neither disclosure changes what its escape hatch writes. Both match the
structure editor's own "Developer view" placement convention (see
`studio-canvas`).

#### Scenario: The override strip's CEL input starts collapsed

- **WHEN** a developer selects a placed field whose `required` override
  is already set to a CEL expression
- **THEN** the strip shows no CEL input until the developer opens its
  "Developer view" disclosure

#### Scenario: The field catalog's JSON textarea starts collapsed

- **WHEN** a developer selects a custom field type in the field catalog
  panel
- **THEN** the panel shows no JSON textarea until the developer opens
  its "Developer view" disclosure
