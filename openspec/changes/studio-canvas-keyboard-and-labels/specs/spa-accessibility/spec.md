## ADDED Requirements

### Requirement: A graphical surface's own nodes are focusable, named and visibly focused

A package may draw a graph of nodes and connectors as SVG. Each node and each
connector a pointer can activate SHALL be reachable from the keyboard. Each
SHALL carry a role, an accessible name, and a place in a roving `tabindex`.

The surface as a whole SHALL be one stop in the page's tab order. A node SHALL
NOT take a stop of its own. Arrow keys SHALL move focus inside the surface.
Enter SHALL activate the focused element the way a click does. Escape SHALL
hand the tab stop back to the surface.

The surface's root element SHALL carry a role and an accessible name of its
own. That root SHALL carry `role="application"`, so an arrow key reaches the
surface's own handler. A screen reader's browse mode otherwise consumes the
key first, and the surface then answers a sighted keyboard user alone. The
root SHALL also take a `tabindex`, so Escape has an element to return focus
to.

A focused element inside such a surface SHALL draw a visible focus indicator.
A CSS `outline` does not follow an SVG shape. The surface SHALL therefore draw
the indicator as an element, made visible under `:focus-visible`. That drawn
indicator SHALL keep the width the design language states, whatever the
surface's own zoom. Each focus target SHALL suppress the global
`:focus-visible` outline, so exactly one indicator draws.

The surface's own root draws no such element. It SHALL keep the global
`:focus-visible` outline, which is the only indicator that root has.

A disclosure the surface draws SHALL be a `<button type="button">`, the same
element an HTML disclosure uses. A `<foreignObject>` sized to that button
alone hosts it, and a corner-sized rectangle covers nothing the surface draws.
The surface SHALL NOT except itself from the disclosure rule.

The studio's canvas is the one surface of this shape today. A future one SHALL
follow the same pattern rather than inventing a second.

#### Scenario: A keyboard user reaches a node

- **WHEN** a keyboard user tabs to the graphical surface
- **THEN** focus lands on one node inside it, and the surface took one stop
  rather than one per node

#### Scenario: A screen reader names a node as a control

- **WHEN** focus reaches a node
- **THEN** a screen reader announces it as a control, with a name identifying
  that node

#### Scenario: An arrow key reaches the surface under a screen reader

- **WHEN** a screen-reader user presses an arrow key on a focused node
- **THEN** the surface's own handler receives the key, and focus moves the
  way it does for a sighted keyboard user

#### Scenario: Enter activates the focused node

- **WHEN** a keyboard user presses Enter on a focused node
- **THEN** the surface does what a click on that node does

#### Scenario: The focus indicator survives the surface's zoom

- **WHEN** a node holds focus and the user has zoomed the surface
- **THEN** the indicator renders at the width the design language states, not
  at that width times the zoom

#### Scenario: Exactly one focus indicator draws

- **WHEN** a node inside the surface holds keyboard focus
- **THEN** the drawn indicator is the only one visible, and the global
  `:focus-visible` outline adds no second ring

#### Scenario: The surface root shows its own focus

- **WHEN** Escape hands the tab stop back and the root itself holds focus
- **THEN** the global `:focus-visible` outline draws on the root, since the
  root carries no drawn ring of its own

#### Scenario: A disclosure inside the surface is a real button

- **WHEN** the surface draws a control that expands or collapses its own
  content
- **THEN** that control is a `<button type="button">` in a `<foreignObject>`
  sized to the button, carrying `aria-expanded` and `aria-controls`

## MODIFIED Requirements

### Requirement: A canvas is not a substitute for a keyboard-operable panel

<!-- antislop: allow sentence-length -->
<!-- Copied byte for byte from the live requirement; the delta only appends the paragraph below. -->
Where a package offers a pointer-driven graphical surface, that surface SHALL
NOT be the only route to an operation. The `studio-canvas` capability already
requires every canvas mutation to have a panel equivalent; this requirement
adds that the panel equivalent SHALL itself be keyboard-operable, since a
pointer-only panel makes the parity guarantee vacuous.

The panel route SHALL stay, and it SHALL stop being the only keyboard route.
The requirement above makes the graphical surface itself operable. A gesture
the surface alone offers, such as a drag, keeps its panel equivalent as the
keyboard route.

#### Scenario: Every canvas operation has a keyboard-reachable panel route

<!-- antislop: allow frozen-verbs -->
<!-- Copied byte for byte from the live scenario; the delta changes no word of it. -->
- **WHEN** a keyboard user needs to perform an operation the canvas offers by
  dragging
- **THEN** the corresponding panel affordance is focusable and operable
  without a pointer

#### Scenario: An operation the surface offers directly needs no panel detour

- **WHEN** a keyboard user selects a node the canvas draws
- **THEN** the canvas itself answers the keystroke, and the panel route stays
  available beside it
