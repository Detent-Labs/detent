## MODIFIED Requirements

### Requirement: The edit screen offers a JSON surface alongside Structure

The Studio edit screen (`/processes/:id/edit`) SHALL offer a JSON surface.
It switches alongside the existing "Structure" surface. Structure covers
every component that mutates the draft body. That includes the process
header, field catalog, data sources, and contract. It also includes canvas
and the steps, paths, timers, and actions panels. The JSON surface shows
the draft body it currently holds as pretty-printed JSON text.

The edit screen SHALL keep only one of the two surfaces visible at a
time. Only that surface SHALL accept interaction. No draft-body-mutating
component SHALL be reachable while the JSON surface is active. No
control from the JSON surface SHALL be reachable while Structure is
active.

`DraftToolbar` (save/publish/discard) and the content-locale switcher
mutate no draft body. Both SHALL remain visible and usable regardless of
which surface is active.

#### Scenario: Switching to the JSON surface shows the current draft

- **WHEN** the developer selects the JSON surface on the edit screen
- **THEN** the JSON surface displays the draft's current body, pretty-printed,
  and no Structure panel remains reachable

#### Scenario: Switching back to Structure reflects the current draft

<!-- antislop: allow synonym-rotation -->
<!-- "display" below names the JSON surface's rendering action, not a
     synonym choice against "surface" (the UI-glossary term for the screen
     itself) used elsewhere in this file. -->
- **WHEN** the developer switches from JSON back to Structure
- **THEN** Canvas and Panels display the draft state the store currently
  holds, including any JSON edit already applied
