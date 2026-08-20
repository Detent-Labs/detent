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

### Requirement: A form states a required field natively

A form SHALL mark a field the submission needs with the `required` attribute.
It SHALL NOT hold its submit control disabled to express the same rule.

The reason is that a disabled control gives no reason. It leaves the pointer
with nothing to click, and the screen reader with nothing to announce. Someone
who left one field empty learns only that the button stopped working. The
`required` attribute instead puts the browser's own message beside the field
that wants it, and moves focus there.

A submit control MAY still go disabled while its submission is in flight. That
states a fact about the request rather than a rule about the input.

#### Scenario: A person submits the login form with an empty field

- **WHEN** a person leaves the email or the password empty and activates
  Sign in
- **THEN** the browser blocks the submission, names the empty field, and moves
  focus to it
- **AND** the submit control was reachable and activatable the whole time

#### Scenario: A submission in flight disables the control

- **WHEN** a login request is in flight
- **THEN** the form disables the submit control until that request settles

#### Scenario: A required field carries no invalid-state styling before use

- **WHEN** the login form first renders with both fields empty
- **THEN** neither field carries invalid-state styling, because the form styles no
  `:invalid` state

### Requirement: A two-dimensional data grid uses roving-tabindex grid semantics

A two-dimensional grid of data cells has rows and columns that both
carry meaning, unlike a single-axis list or table. Where a package
renders one, the grid SHALL carry `role="grid"`. The grid as a whole
SHALL be one stop in the page's tab order. Each cell SHALL NOT take its
own stop. Arrow keys SHALL move focus one cell at a time within the
grid, in the direction pressed.

Each column header cell SHALL carry `<th scope="col">`. Each row header
cell SHALL carry `scope="row"`. Together these let a screen reader
announce a cell's row and column identity, alongside its content.

Where the grid scrolls independently of the page, its scrolling region
SHALL carry `tabindex="0"` and an accessible name. A keyboard user can
then reach and scroll it, without first tabbing to a cell inside it.

This governs the `studio-app` capability's field matrix, the one grid
of this shape in the browser packages today. A future grid of the same
shape SHALL follow the same pattern rather than inventing a second one.

#### Scenario: The grid is one tab stop

- **WHEN** a keyboard user tabs toward the grid
- **THEN** focus lands on the grid once, not once per cell

#### Scenario: Arrow keys move within the grid

- **WHEN** a keyboard user presses an arrow key while focus is inside
  the grid
- **THEN** focus moves to the adjacent cell in that direction
- **AND** the grid remains the page's one tab stop for it

#### Scenario: A screen reader announces a cell's row and column together

- **WHEN** focus reaches a data cell
- **THEN** the announcement includes both the cell's row header and its
  column header, alongside the cell's own content

#### Scenario: The scroll region is reachable without a cell first

- **WHEN** a keyboard user tabs to the grid's scrolling region directly
- **THEN** it is focusable, carries an accessible name, and scrolls with
  the keyboard

### Requirement: A tab set matches the area's tab pattern

<!-- antislop: allow synonym-rotation -->
<!-- Why: "surface" above names a studio authoring surface. "render" here is the tab panel's own display verb, an unrelated concept, not a rotated synonym. -->
A tab set SHALL group its tabs in a `tablist`. Each tab SHALL be a
button carrying `role="tab"`. The active tab SHALL carry
`aria-selected`. Each tab SHALL be its own stop in the tab order, the
way a button is. Enter or Space SHALL activate the focused tab. The
active tab's panel SHALL render, and the others SHALL hide.

#### Scenario: A tab activates with Enter

- **WHEN** a keyboard user focuses a tab and presses Enter
- **THEN** that tab becomes active, and its panel renders

#### Scenario: The active tab states its state

- **WHEN** a screen reader reaches the tab set
- **THEN** the active tab reports `aria-selected`, and the hidden
  panels leave the accessibility tree
