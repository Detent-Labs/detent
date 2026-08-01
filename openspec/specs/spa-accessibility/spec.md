# spa-accessibility Specification

## Purpose

Governs keyboard and assistive-technology access across the browser packages
(`packages/web`).
The rules here are
cross-package: they hold wherever a screen offers navigation, a
disclosure, or a graphical surface, rather than belonging to any one app's
capability. Per-control rendering detail that lives inside the shared form
renderer belongs to `form-ui`; the canvas's own parity rule belongs to
`studio-canvas`.
## Requirements
### Requirement: Anything that navigates is a real, focusable control

In every browser package, an element whose activation navigates the user
somewhere SHALL be a real interactive control — a `<button>` or an `<a href>`
— reachable in the tab order, operable with Enter (and Space, for a button),
and announced with an accessible name describing where it leads.

A click handler on a `<tr>`, `<li>` or `<div>` SHALL NOT be the only way to
reach a destination. Such an element is not focusable, is not announced, and
is inert to the keyboard, so the destination is unreachable without a pointer.

Where a row of data is the navigable unit, the control SHALL wrap the row's
identifying content rather than the row element, and the row-level click
handler SHALL be removed rather than retained alongside it — a row that is
clickable but not focusable is the state that hides this defect.

This currently blocks:

- opening **any** task in the app area, which is the whole purpose of that
  app — WCAG 2.1.1 Keyboard, Level A;
- drilling into any instance or timer in the admin area.

#### Scenario: A participant opens a task with the keyboard

- **WHEN** a keyboard-only user tabs through the task list in the app area
  and presses Enter on a task
- **THEN** that task's screen opens, exactly as a pointer click opens it

#### Scenario: An operator drills into a row with the keyboard

- **WHEN** a keyboard-only user tabs through the instance list or the timer
  list in the admin area and activates a row
- **THEN** that row's detail opens

#### Scenario: A screen reader announces the destination

- **WHEN** focus reaches a row's control
- **THEN** it is announced as a control with a name identifying the row it
  opens, not as undifferentiated text

#### Scenario: A focus indicator is visible

- **WHEN** a control receives keyboard focus
- **THEN** a visible focus indicator is rendered — a focusable control with no
  focus style is operable but unusable

### Requirement: A disclosure is a button carrying its expanded state

An element that expands or collapses adjacent content SHALL be a
`<button type="button">` carrying `aria-expanded` reflecting its current
state and `aria-controls` naming the element it discloses.

Both `StepsPanel` implementations currently use a click-handling `<div>`
header, so an existing step cannot be expanded without a pointer. (A step
added during the session is expanded by its add action, which is why the
defect is in the header, not in the panel.)

#### Scenario: An existing step expands with the keyboard

- **WHEN** a keyboard user tabs to a step card's header and presses Enter or
  Space
- **THEN** the card expands, and pressing again collapses it

#### Scenario: The state is announced

- **WHEN** focus is on a step card's header
- **THEN** its expanded or collapsed state is announced, via `aria-expanded`

### Requirement: A canvas is not a substitute for a keyboard-operable panel

Where a package offers a pointer-driven graphical surface, that surface SHALL
NOT be the only route to an operation. The `studio-canvas` capability already
requires every canvas mutation to have a panel equivalent; this requirement
adds that the panel equivalent SHALL itself be keyboard-operable, since a
pointer-only panel makes the parity guarantee vacuous.

#### Scenario: Every canvas operation has a keyboard-reachable panel route

- **WHEN** a keyboard user needs to perform an operation the canvas offers by
  dragging
- **THEN** the corresponding panel affordance is focusable and operable
  without a pointer

