## MODIFIED Requirements

### Requirement: The edit screen offers a JSON surface alongside Structure

The process surface (`/processes/:id/edit`) SHALL offer a JSON surface. An
author opens it from the header bar's `⋮` menu. No Structure control and no
JSON control SHALL stand beside the header bar any more. The JSON entry
lives inside that menu, instead of as a separate toggle beside it.

The tab body covers every component that changes the draft body. That includes
the process header, the field catalog, the data sources and the contract. It
also includes the canvas, the step page, and the paths, timers and actions
sections. The JSON surface prints the draft body it currently holds as
pretty-printed JSON text.

The process surface SHALL keep only one of the two visible at a time. Only the
visible one SHALL accept interaction. No component that changes the draft body
SHALL be reachable while the JSON surface stands open. No control from the JSON
surface SHALL be reachable while a tab stands open.

The header bar menu's JSON entry SHALL name its own state. An author reads
from it whether the entry opens the JSON surface or leaves it.

`DraftToolbar` (save/publish/discard) and the content-locale switcher change no
draft body. Both SHALL stay visible and usable whichever of the two stands
open.

#### Scenario: Switching to the JSON surface shows the current draft

- **WHEN** the developer picks the JSON entry in the header bar's `⋮` menu
- **THEN** the JSON surface prints the draft's current body, pretty-printed
- **AND** no tab body remains reachable

#### Scenario: Switching back to Structure reflects the current draft

- **WHEN** the developer picks the same header-bar-menu entry a second time
- **THEN** the tab that stood open before prints the draft state the store
  currently holds
- **AND** that state carries any JSON edit already applied

<!-- antislop: allow negation-habit - the scenario title must stay byte-identical to the base spec's -->
#### Scenario: The header bar carries no surface pair

- **WHEN** the developer reads the header bar's row without opening its `⋮`
  menu
- **THEN** no Structure control and no JSON control stand there directly
- **AND** opening the `⋮` menu is what reaches the JSON entry
