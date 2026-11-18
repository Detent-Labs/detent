## MODIFIED Requirements

### Requirement: A canvas is not a substitute for a keyboard-operable panel

<!-- antislop: allow sentence-length -->
<!-- Why: the first paragraph keeps the live requirement's words; this delta rewrites the second paragraph alone. -->
Where a package offers a pointer-driven graphical surface, that surface SHALL
NOT be the only route to an operation. The `studio-canvas` capability already
requires every canvas mutation to have a panel equivalent; this requirement
adds that the panel equivalent SHALL itself be keyboard-operable, since a
pointer-only panel makes the parity guarantee vacuous.

The panel route SHALL stay, and it SHALL stop being the only keyboard route.
The requirement above makes the graphical surface itself operable. A drag the
surface offers keeps its panel equivalent as a keyboard route. The surface
can answer that drag's operation from the keyboard too. The panel route SHALL
then stay beside the surface's own route.

#### Scenario: Every canvas operation has a keyboard-reachable panel route

<!-- antislop: allow frozen-verbs -->
<!-- Why: the scenario keeps the live spec's own words, "perform an operation" among them. -->
- **WHEN** a keyboard user needs to perform an operation the canvas offers by
  dragging
- **THEN** the corresponding panel affordance is focusable and operable
  without a pointer

<!-- antislop: allow negation-habit -->
<!-- Why: a MODIFIED block keeps every base scenario under its live name. -->
#### Scenario: An operation the surface offers directly needs no panel detour

- **WHEN** a keyboard user selects a node the canvas draws
- **THEN** the canvas itself answers the keystroke, and the panel route stays
  available beside it

#### Scenario: A drag the surface answers by key keeps its panel route

- **WHEN** a graphical surface answers a drag's operation from the keyboard
  on the surface itself
- **AND** a keyboard user needs that operation
- **THEN** the surface's own keyboard route performs it
- **AND** the panel route still performs it from the keyboard

## ADDED Requirements

### Requirement: A graphical surface announces a keystroke's unseen result

A keystroke on a graphical surface can change something the focused element's
name does not report. Examples are a zoom level, a new connector and a refused
operation. The surface SHALL announce that result through one polite live
region of its own. The region SHALL stay mounted while the surface shows, so
its first announcement reaches a screen reader. Every announcement SHALL read
from the area's catalog, in the author's words.

#### Scenario: A zoom key announces the new level

- **WHEN** a keyboard user zooms a graphical surface with a key
- **THEN** the surface's live region names the new zoom level

#### Scenario: The region is ready before the first keystroke

- **WHEN** a graphical surface first shows
- **THEN** its live region already stands in the document, empty

#### Scenario: A refused keystroke says why

- **WHEN** a keyboard user presses a key whose operation the surface refuses
- **THEN** the live region reads the refusal the surface shows
