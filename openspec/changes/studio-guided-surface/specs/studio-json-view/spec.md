## MODIFIED Requirements

<!-- The heading repeats the live spec's wording verbatim, so a delta can match it. -->
<!-- antislop: allow synonym-rotation -->
### Requirement: The edit screen offers a JSON surface alongside Structure

The process surface (`/processes/:id/edit`) SHALL offer a JSON surface. An
author opens it from the tab row's overflow menu. No Structure control and no
JSON control SHALL stand beside the header bar any more.

The tab body covers every component that changes the draft body. That includes
the process header, the field catalog, the data sources and the contract. It
also includes the canvas, the step page, and the paths, timers and actions
sections. The JSON surface prints the draft body it currently holds as
pretty-printed JSON text.

The process surface SHALL keep only one of the two visible at a time. Only the
visible one SHALL accept interaction. No component that changes the draft body
SHALL be reachable while the JSON surface stands open. No control from the JSON
surface SHALL be reachable while a tab stands open.

The overflow menu's JSON entry SHALL name its own state. An author reads from
it whether the entry opens the JSON surface or leaves it.

`DraftToolbar` (save/publish/discard) and the content-locale switcher change no
draft body. Both SHALL stay visible and usable whichever of the two stands
open.

#### Scenario: Switching to the JSON surface shows the current draft

- **WHEN** the developer picks the JSON entry in the tab row's overflow menu
- **THEN** the JSON surface prints the draft's current body, pretty-printed
- **AND** no tab body remains reachable

#### Scenario: Switching back to Structure reflects the current draft

- **WHEN** the developer picks the same overflow entry a second time
- **THEN** the tab that stood open before prints the draft state the store
  currently holds
- **AND** that state carries any JSON change already applied

#### Scenario: The header bar carries no surface pair

- **WHEN** the developer reads the header bar
- **THEN** no Structure control and no JSON control stand in it
