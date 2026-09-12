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

### Requirement: A disclosure is a button that carries its expanded state

An element that expands or collapses adjacent content SHALL be a
`<button type="button">` carrying `aria-expanded` reflecting its current
state and `aria-controls` naming the element it discloses.

The studio's step cards carried this defect: a click-handling `<div>` header
no keyboard could open. The rail in `StepsRail.tsx` replaced those cards. Its
rows are buttons that open a step page, and the current row carries
`aria-current`. Its two chevrons reorder a step. No row in the rail expands.

The step page stands every section open, so no section heading discloses
anything. Two disclosures remain, and both read "Developer view". The step's
own read-only JSON stands behind a native `<details>` pair. The browser
supplies its button role, its keyboard operation and its state announcement.
This requirement governs a disclosure a package builds itself. A native pair
stays outside it.

A path's guard editor carries the second, one toggle per automatic path. The
studio builds that button itself, so this requirement governs it. It carries
`aria-expanded` and no `aria-controls`. That gap predates this change and
stays open.

#### Scenario: A steps rail row selects rather than discloses

- **WHEN** a keyboard user tabs to a row in the steps rail and presses Enter
  or Space
- **THEN** that step's page opens, and no rail row carries `aria-expanded`

#### Scenario: A native disclosure sits outside this requirement

- **WHEN** focus reaches the `<summary>` over the step page's read-only JSON
- **THEN** Enter toggles it, and a screen reader reads its open state from the
  native `<details>` pair

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
alone hosts it. The surface SHALL draw that host in a pass late enough that
nothing the surface paints afterwards covers it. The surface SHALL NOT except
itself from the disclosure rule.

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
`aria-selected`. The active tab's panel SHALL render, and the others
SHALL hide.

An ordinary tab set SHALL follow the plain-button pattern. Each tab is its
own stop in the tab order, the way a button is. Enter or Space activates
the focused tab.

A tab set carrying many tabs in one line that scrolls sideways MAY
instead follow the roving-tabindex pattern. The row is one stop in the
page's tab order. Exactly one tab carries `tabindex="0"`, and the rest
`tabindex="-1"`. That one is the active tab until an arrow key moves
focus, and the focused tab afterwards. The left and right arrow keys move
focus one tab at a time within the row. They do not activate the newly
focused tab. Enter or Space still activates it.

This is the WAI-ARIA tabs pattern's roving-tabindex variant. It exists for
a row wide enough to need it. One plain Tab stop per tab would cost a
keyboard user many presses to cross such a row. This governs
`studio-process-tabs`' own ten-tab row, the one tab set of this shape in
the browser packages today. A future tab set that takes this route
SHALL follow this same pattern rather than inventing a second one. Every
other tab set keeps the plain-button pattern.

#### Scenario: A tab activates with Enter

- **WHEN** a keyboard user focuses a tab and presses Enter
- **THEN** that tab becomes active, and its panel renders

#### Scenario: The active tab states its state

- **WHEN** a screen reader reaches the tab set
- **THEN** the active tab reports `aria-selected`, and the hidden
  panels leave the accessibility tree

#### Scenario: A roving-tabindex row keeps one tab stop

- **WHEN** a keyboard user tabs toward a many-tab row following the
  roving-tabindex pattern
- **THEN** focus lands once, on the row's active tab

#### Scenario: Arrow keys move focus within a roving-tabindex row

- **WHEN** a keyboard user presses the right arrow while focus is on a
  tab in a roving-tabindex row
- **THEN** focus moves to the next tab in the row
- **AND** that tab does not become active; only focus moves

#### Scenario: Enter activates the focused tab in a roving-tabindex row

- **WHEN** a keyboard user presses Enter on a focused, not-yet-active
  tab in a roving-tabindex row
- **THEN** that tab becomes active, and its panel renders

### Requirement: A reordering gesture inside a list answers the keyboard in that list

A package may offer a drag that moves an entry inside a list. That list SHALL
answer the same move from the keyboard. The move SHALL happen in the list
itself. A separate panel, a dialog or a JSON editor SHALL NOT be the
only keyboard route.

The canvas requirement above sends a keyboard user to the panel equivalent.
That answer works because the canvas draws a graph, and a panel states the
same graph in controls. A list has no such second statement of itself. The
list is already the panel, so a detour would lead back to the same list.

One kind of move takes a different route. A drag can move an entry into a
group or out of one. That move SHALL answer the keyboard in the editor beside
the list, which selecting the entry opens. That editor is no detour. Selection
opens it anyway, and it states the entry's own properties, its group among
them. A dialog and a JSON editor never qualify.

A move among siblings stays under the rule above.

The moving entry SHALL keep keyboard focus across the move. A keyboard user
who moves an entry three positions SHALL do so with three keystrokes and no
focus hunt. On the editor route, focus SHALL stay on the editor's move
control.

Each move SHALL announce its result to a screen reader through a live
region. The announcement SHALL name the entry and its new place.

#### Scenario: A keyboard user moves an entry the drag also moves

- **WHEN** a keyboard user focuses an entry a pointer can drag among its
  siblings
- **AND** the user presses the documented move keystroke
- **THEN** the entry moves in the list, exactly as the drag moves it

#### Scenario: Focus follows the moved entry

- **WHEN** a keyboard user moves the focused entry one place
- **THEN** that same entry still holds keyboard focus in its new place

#### Scenario: The move announces itself

- **WHEN** a keyboard user moves an entry
- **THEN** a live region names the entry and where it landed

#### Scenario: No detour stands in for the in-list move

- **WHEN** a keyboard user needs to move an entry to a new place among its
  siblings
- **THEN** the list answers the keystroke, and no dialog and no separate
  editor opens to take the move instead

#### Scenario: A change of group answers the keyboard in the entry's editor

- **WHEN** a keyboard user selects a field entry in the studio's Fields rail
  and tabs into the editor beside it
- **THEN** the editor's move control moves that field into a group or out of
  one
- **AND** a live region names the field and where it landed, and focus stays
  on that move control

### Requirement: A control inside a grid cell joins the grid's roving model

A grid is one stop in the page's tab order. A control a grid renders inside
one of its cells SHALL NOT take a stop of its own. It SHALL carry
`tabindex="-1"`. The arrow keys that move focus through the grid SHALL reach
it.

A header cell counts as a cell here. A bulk-action control in a header row
sits inside the grid. It follows the grid's own model. The page's tab order
skips it.

This closes a gap the roving-tabindex requirement leaves open. That
requirement says a cell takes no stop of its own. It says nothing about a
button a cell contains. The field matrix put thirty of those in the tab
order.

#### Scenario: A header control takes no tab stop of its own

- **WHEN** a keyboard user tabs through a page holding a grid whose header
  cells carry action controls
- **THEN** focus lands on the grid once
- **AND** it does not land on any of those controls in turn

#### Scenario: An arrow key reaches a header control

- **WHEN** focus sits on a cell in the grid's first row and the user presses
  the up arrow
- **THEN** focus moves to that column's header cell
- **AND** a control that header carries can take focus from there

### Requirement: A dense grid meets the target-size floor through spacing

A pointer target smaller than 24 by 24 CSS pixels SHALL sit clear of its
neighbors. Centre a 24 pixel circle on each target's box. No circle SHALL touch
another. WCAG 2.5.8 allows this spacing route. It holds a dense grid to
the standard without growing its cells.

A grid of this shape reads by density. Growing every checkbox to 24 by 24
would cost that, so the spacing route is the one to take here.

#### Scenario: Adjacent bulk badges clear the spacing floor

- **WHEN** a header cell draws its three bulk badges side by side
- **THEN** a 24 pixel circle centred on each badge touches no other badge's
  circle

#### Scenario: Adjacent cell checkboxes clear the spacing floor

- **WHEN** a data cell draws its three flag checkboxes side by side
- **THEN** a 24 pixel circle centred on each checkbox touches no other
  checkbox's circle
