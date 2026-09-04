## REMOVED Requirements

<!-- Why: "canvas edit screen" names a screen; a change is what this file proposes. -->
<!-- antislop: allow synonym-rotation -->
### Requirement: The canvas edit screen lays out a palette, the canvas, the inspector, and a checks rail

**Reason**: The three-column grid is the shape this change replaces. Every
rule the requirement stated rests on three things. A first column holds the
palette. A third column swaps between the inspector and the checks rail. A
dock sits below. None of the three exist on the bench.

**Migration**: The rules that still hold move to the requirements this change
adds. Each row names the rule, then its new home.

<!-- Why: "structure surface" is the domain term for this screen, per CLAUDE.md. -->
<!-- antislop: allow synonym-rotation -->
- The height rule and its floor → the layout requirement this change adds,
  named for the structure surface.
- The checks rail's collapsed presentation → `studio-checks-rail`'s
  collapsed-summary requirement, whose home becomes the ribbon bar.
- The several-steps count and delete control → the same layout requirement.
  The configuration pane shows it in place of a step.

### Requirement: Selecting a node or edge shows its detail in a three-zone, tab-driven inspector beside the canvas

**Reason**: The requirement's frame is a tab row. Every rule about which tab
shows, resets, or lists has no tab left to name. The identity zone and the
diagnostics drawer it describes both go.

**Migration**: Each rule that still holds moves as follows.

- The masthead's contents, the missing-translation warnings, the initial-step
  control → "The configuration pane's masthead names the step". The outcome
  field goes to the Exit section instead, per the register requirement.
- The section set → "The configuration pane shows the step as a register of
  sections in runtime order". What each section holds goes there too, and so
  does the subprocess cross-process fieldset.
- A terminal step's empty paths and its suppressed assignment warning → "The
  configuration pane's sections follow the performed-by control". Subprocess
  joining and leaving goes there too.
- The view button's navigation and its form-status summary → the same
  register requirement, under the Form section.
- A path-edge click resolving to its source step → the same register
  requirement. It opens the Paths section and highlights the row.
- Adding the first step with nothing selected → the palette requirement,
  modified below.

### Requirement: The step inspector's diagnostics drawer discloses the step's raw data

**Reason**: The drawer goes. Its three jobs disperse.

<!-- Why: "Remove step" is a literal UI label, not a synonym for delete. -->
<!-- antislop: allow synonym-rotation -->
**Migration**: The issue count moves to each section head and to the
masthead. The "View raw JSON" toggle and the "Remove step" control move into
the masthead's overflow. The docked checks summary moves to the ribbon bar.
"The configuration pane's masthead names the step" states the first two.
`studio-checks-rail` states the third.

### Requirement: A dock below the canvas columns collapses and opens

**Reason**: The dock goes. The canvas becomes a ribbon above the bench, so
no strip remains below the columns to host it.

**Migration**: Its three tabs have new homes. The Field matrix tab was
already a panels-screen view. The Changes and Paths tabs become panels-screen
views, per `studio-app`. The ribbon's own open state follows the same rule
the dock followed. Nothing persists it, and the draft's `layout` blob carries
no key for it.

### Requirement: The dock offers three tabs, one active at a time

**Reason**: No dock, so no dock tabs.

**Migration**: See the dock requirement above.

### Requirement: The Changes tab shows what a publish would change

**Reason**: The view survives whole. Only its host changes.

**Migration**: `studio-app` adds "The panels screen's Changes view shows what
a publish would change". Every rule moves unchanged.

### Requirement: The Field matrix tab mounts the field matrix

**Reason**: The dock added a second route to the grid. That route goes with
the dock. The panels screen keeps the first.

**Migration**: None. The panels screen's field matrix view stays as it is.

### Requirement: The Paths tab lists every path in the process

**Reason**: The view survives whole. Only its host changes.

**Migration**: `studio-app` adds "The panels screen's Paths view lists every
path in the process". Every rule moves unchanged, including the pure row
derivation and its test.

### Requirement: The inspector's identity zone and diagnostics drawer render from compiled styles

**Reason**: The three regions it names go.

**Migration**: "The bench renders from compiled styles" covers the masthead,
the section register and the steps register.

### Requirement: The dock's own layout renders from compiled styles

**Reason**: No dock.

**Migration**: None.

## RENAMED Requirements

- FROM: `### Requirement: The identity zone's step key auto-derives from the step label`
- TO: `### Requirement: The masthead's step key auto-derives from the step label`

- FROM: `### Requirement: The identity zone's type and terminal controls render as a "performed by" segmented control`
- TO: `### Requirement: The masthead's type and terminal controls render as a "performed by" segmented control`

- FROM: `### Requirement: The identity zone constrains a terminal step's outcome to the process's declared outcomes`
- TO: `### Requirement: The masthead constrains a terminal step's outcome to the process's declared outcomes`

## MODIFIED Requirements

### Requirement: A palette offers Step, Subprocess, and End as an always-available way to add a step

The expanded canvas ribbon SHALL show a palette listing Step, Subprocess,
and End. Each entry SHALL be a drag source. Dragging one onto the canvas
SHALL add a step of that kind at the drop point. That SHALL use the same
draft-mutation method the steps register's own add control calls.

The palette SHALL stay usable regardless of canvas selection.

A draft holding no step SHALL offer an add control in the steps register.
That control SHALL add a step of type `task`. The collapsed ribbon shows no
palette, so the register carries the one always-reachable way to add the
first step.

#### Scenario: Dragging a palette entry adds a step

- **WHEN** the developer expands the ribbon and drags the Step entry onto
  the canvas
- **THEN** a new step of type `task` exists at the drop point

#### Scenario: The palette works with nothing selected

- **WHEN** the developer selects nothing on the canvas
- **THEN** every palette entry stays usable

#### Scenario: An empty draft adds its first step from the register

- **WHEN** a draft holds no step and the ribbon stays collapsed
- **THEN** the steps register shows an add control, and activating it adds a
  step of type `task`

### Requirement: The inspector's Paths and Timers tabs render from compiled styles

`panels/PathsPanel.tsx`, the body of the configuration pane's Paths
section, SHALL render from compiled component styles. The rendered result
SHALL match the previous stylesheet declaration for declaration.

`panels/TimersPanel.tsx`, the body of the Timers section, renders no class
this migration covers. It already satisfies this requirement, unchanged.

#### Scenario: The Paths tab keeps its look

- **WHEN** a browser opens the configuration pane's Paths section
- **THEN** its computed layout, spacing, color and border equal the values
  the deleted stylesheet declared

## ADDED Requirements

### Requirement: The structure surface lays out a canvas ribbon, a steps register and the configuration pane

The structure surface SHALL show three regions. The canvas ribbon spans the
full width above. Beneath it, the steps register stands on the left and the
configuration pane on the right.

The ribbon SHALL start collapsed on every load. A collapsed ribbon shows a
bar and a band. The bar holds the ribbon's control and the checks summary.
The band draws the graph at fit scale. An expanded ribbon shows the full
canvas with the palette.

Every canvas interaction the other requirements of this capability state
SHALL stay live in both states. The two differ in height, and in whether the
palette lists. The band draws a shorter canvas, not a lesser one.

The ribbon's control SHALL be a `<button type="button">`. It carries
`aria-expanded` for its state and `aria-controls` naming the ribbon's body.

Nothing SHALL persist the ribbon's open state. It lives in the screen's own
component state. A reload returns the ribbon to collapsed. The draft's
`layout` blob SHALL carry no key for it.

Selection SHALL cross both ways. Selecting a node on the canvas opens that
step in the configuration pane and marks its row in the register. Choosing a
row in the register opens that step and marks its node.

The configuration pane SHALL show the register's first step when the
developer has selected none. It SHALL show the selection's own count and
delete control when the selection holds more than one step.

The screen's header rows and the collapsed ribbon take their height first.
The register and the pane SHALL fill what remains, above a floor of 36rem.
Expanding the ribbon takes height from both down to that floor. Past it, the
page scrolls.

Below 64rem of width the steps register SHALL collapse to a disclosure. The
panels screen's index rail already follows that rule, at that same
breakpoint.

#### Scenario: The three regions appear

- **WHEN** the structure surface loads
- **THEN** the ribbon, the steps register and the configuration pane each
  appear as their own region

#### Scenario: The ribbon starts collapsed

- **WHEN** the developer opens the structure surface
- **THEN** the ribbon shows its bar and the fit-scale band, and no palette

#### Scenario: The control expands and collapses the ribbon

- **WHEN** the developer activates the ribbon's control
- **THEN** the full canvas shows, with the palette
- **AND** activating the control again returns the ribbon to its band

#### Scenario: A canvas selection opens the pane

- **WHEN** the developer clicks a step node in the ribbon
- **THEN** the configuration pane shows that step, and its register row
  reads as current

#### Scenario: A register selection marks the node

- **WHEN** the developer chooses a step's row in the register
- **THEN** the configuration pane shows that step, and its node reads as
  selected in the ribbon

#### Scenario: Several steps show the count

- **WHEN** the developer selects more than one step
- **THEN** the configuration pane shows the selection count and its delete
  control, not a step

#### Scenario: A reload returns the ribbon to collapsed

- **WHEN** the developer expands the ribbon and reloads the screen
- **THEN** the ribbon shows its band

#### Scenario: Saving a draft writes no ribbon state

- **WHEN** the developer expands the ribbon and saves the draft
- **THEN** the saved `layout` blob carries no key naming the ribbon

#### Scenario: A short window holds the floor

- **WHEN** the structure surface loads in a window shorter than the floor
- **THEN** the register and the pane keep 36rem and the page scrolls

### Requirement: The steps register lists every step in reachability order

The steps register SHALL show one ruled row per step in the draft. Each row
carries the step's role stamp, its label resolved for the content locale,
and its issue count. The count prints only above zero, as a refusal-tone
stamp.

The role stamp SHALL read `Initial` for the draft's `initialStep`, `End`
for a step carrying `terminal: true`, `Subprocess` for a step of that type,
and `Task` otherwise. Those four use the existing stamp tones.

Rows SHALL follow reachability from the initial step. Terminal steps come
last, in the draft's own order. A step no path reaches comes after the
reachable ones and before the terminal ones.

A row's identifying content SHALL be a real `<button type="button">`. The
row itself carries no click handler. The current step's row carries
`aria-current="true"`.

Below the steps, the register SHALL carry the process links. Those are
Fields, Data sources, Contract, Field matrix, Changes and Paths. Each opens
the panels screen at its own view, per `studio-app`. Each shows its count
where one exists.

#### Scenario: Every step takes a row

- **WHEN** a draft holds seven steps
- **THEN** the register shows seven rows

#### Scenario: Rows follow reachability

- **WHEN** a draft's initial step reaches step B, and B reaches terminal
  step C
- **THEN** the register lists the initial step, then B, then C

#### Scenario: An issue count prints on its row

- **WHEN** one step carries two open issues and another carries none
- **THEN** the first row shows a count of two, and the second shows no
  count

#### Scenario: A row is a real control

- **WHEN** a keyboard user tabs into the register
- **THEN** each row's identifying content takes focus as a button, and the
  current row carries `aria-current`

### Requirement: The configuration pane's masthead names the step

The configuration pane SHALL open with a masthead above the section
register. The masthead does not scroll with the register.

The masthead SHALL carry the step's role stamp, its label, its key and its
id. It SHALL also carry the description, the performed-by control, the
initial-step control, the issue count, and an overflow control. The label
edits inline. The key and
the id print in the mono face. The description edits as localized text.

The masthead SHALL keep the missing-translation warning beside the label and
beside the description. Those are two of the six `LocalizedTextInput` sites
`studio-app` requires a warning at. Each warning is a sibling of its field,
never nested inside a label.

The initial-step control SHALL show only when the step is not the draft's
`initialStep`. When it is, the role stamp reads `Initial` and no control
appears.

The outcome field does not sit here. A terminal step's outcome is what it
produces on departure, so the Exit section holds it. The register requirement
below states that. The field's own hint states that an outcome binds only on
a contracted process, and no label carries a parenthetical.

The overflow control SHALL open two entries: "View raw JSON" and "Remove
step". The first shows the step's raw JSON, read-only, in place below the
masthead. It carries `aria-expanded` and `aria-controls`. The second removes
the step, as the diagnostics drawer's control did.

The issue count SHALL total the step's own issues and those of its paths,
timers and actions. It prints as a refusal-tone stamp above zero.

#### Scenario: The masthead shows the step's identity

- **WHEN** the developer selects a step
- **THEN** the masthead shows its role stamp, label, key, id, description
  and performed-by control

#### Scenario: The label edits inline

- **WHEN** the developer edits the label in the masthead
- **THEN** the draft's step label updates, and the key derives per the
  masthead's key-derivation requirement

#### Scenario: The masthead keeps its translation warnings

- **WHEN** the content locale is `de` and the step's label carries no `de`
  value
- **THEN** the missing-translation warning renders beside the label

#### Scenario: The masthead sets the initial step

- **WHEN** the developer activates "Set as initial step" in the masthead
- **THEN** the draft's `workflow.initialStep` names that step, the stamp
  reads `Initial`, and the control disappears

#### Scenario: The overflow shows raw JSON

- **WHEN** the developer chooses "View raw JSON" from the overflow
- **THEN** the step's raw JSON renders read-only below the masthead

#### Scenario: The overflow offers step removal

- **WHEN** the developer chooses "Remove step" from the overflow
- **THEN** the step leaves the draft, and the pane shows the register's
  first remaining step

#### Scenario: The issue count covers a path's issue

- **WHEN** a step carries no issue of its own and one of its paths carries
  a failing guard
- **THEN** the masthead's count reads one

### Requirement: The configuration pane shows the step as a register of sections in runtime order

Below the masthead, the configuration pane SHALL show a register of
sections in a fixed order. That order is Entry, Assignment, Form, Paths,
Timers, Exit. A Subprocess section joins after Exit when performed-by reads
Subprocess.

Every section head SHALL show at all times. A head carries the section's
name and its resolved value or count, right-aligned in the mono face. An
empty section prints `—` as its value. A head carrying issues also shows
their count as a refusal-tone stamp.

Each head SHALL be a `<button type="button">` carrying `aria-expanded` and
`aria-controls`. Choosing it expands or collapses the section in place.
Several sections stay open at once. The pane keeps each step's open set
for as long as the draft stays loaded.

A section carrying content or an issue SHALL open by default. An empty one
stays closed.

The sections SHALL hold what follows. No section's own fields, validation or
mutation logic differs from the panel it hosts.

- Entry holds the `onEntry` actions.
- Assignment holds the assignment strategy and the no-assignment warning.
- Form holds the configured-field count, a "Build the form" control, and no
  editor. That control navigates to the form editor's routed page.
- Paths holds the paths editor.
- Timers holds the timers editor.
- Exit holds the `onExit` and `onCancel` actions, and the outcome field on a
  terminal step.
- Subprocess holds the spec editor and the cross-process check fieldset.
  That fieldset's file input loads a child body, and
  `checkSubprocessChildRefs` runs against nothing without it.

Selecting a path edge on the canvas SHALL resolve to its source step. The
pane opens that step with its Paths section expanded and the path's own row
highlighted.

#### Scenario: Every section head shows

- **WHEN** the developer selects a step with three paths, two timers and no
  entry actions
- **THEN** the pane shows all six heads, with Paths reading 3, Timers 2, and
  Entry reading `—`

#### Scenario: Sections with content open by default

- **WHEN** the developer selects that same step
- **THEN** Paths and Timers show their bodies, and Entry shows none

#### Scenario: A head expands its section in place

- **WHEN** the developer chooses a collapsed section's head
- **THEN** that section's body shows below its head, and no other section
  changes state

#### Scenario: Several sections stay open together

- **WHEN** the developer expands Paths and then expands Timers
- **THEN** both bodies show

#### Scenario: The open set survives a selection change

- **WHEN** the developer collapses Paths on step A, selects step B, and
  returns to step A
- **THEN** Paths on step A is still collapsed

#### Scenario: A section head carries its issue count

- **WHEN** one of the step's paths carries a failing guard
- **THEN** the Paths head shows an issue count of one

#### Scenario: Entry and Exit split the three action lists

- **WHEN** the developer selects a step with one `onEntry` and one `onExit`
  action
- **THEN** Entry reads 1 action, Exit reads 1 action, and each body holds
  the matching editor

#### Scenario: The Form section navigates to the form editor

- **WHEN** the developer chooses "Build the form" in the Form section
- **THEN** the form editor's routed page opens for that step

#### Scenario: The Subprocess section keeps the cross-process check

- **WHEN** the developer selects a step of type `subprocess`
- **THEN** the Subprocess section holds the spec editor and the
  cross-process fieldset, whose file input still loads a child body

#### Scenario: A path edge opens its source step's Paths section

- **WHEN** the developer clicks a path edge on the canvas
- **THEN** the pane shows the edge's source step, Paths shows its body, and
  the clicked path's row carries the highlight

#### Scenario: A head activates with the keyboard

- **WHEN** a keyboard user focuses a section head and presses Enter or
  Space
- **THEN** the section toggles, and `aria-expanded` reflects the new state

### Requirement: The configuration pane's sections follow the performed-by control

The section register SHALL change shape with the masthead's performed-by
control.

When performed-by reads Terminal, the pane SHALL omit the Paths and Timers
sections. In their place one line states that a terminal step has no
outgoing path and no timer. The Assignment section SHALL show no
no-assignment warning on a terminal step. That mirrors the existing rule:
`terminal === true || assignment !== undefined`.

When performed-by reads Subprocess, the pane SHALL omit the Assignment and
Form sections and add the Subprocess section. A subprocess step is a
wait-state with no participant form.

When performed-by changes, the register SHALL re-render to the new shape at
once. A section that no longer lists cannot stay open.

#### Scenario: A terminal step omits Paths and Timers

- **WHEN** the developer selects a step carrying `terminal: true`
- **THEN** the pane shows no Paths head and no Timers head, and one line
  states why

#### Scenario: A terminal step suppresses the no-assignment warning

- **WHEN** the developer selects a step carrying `terminal: true` and no
  `assignment`
- **THEN** the Assignment section shows no no-assignment warning

#### Scenario: A subprocess step swaps Assignment and Form for Subprocess

- **WHEN** the developer selects a step of type `subprocess`
- **THEN** the pane shows no Assignment head and no Form head, and shows a
  Subprocess head

#### Scenario: Leaving Subprocess drops its section

- **WHEN** the developer changes performed-by from Subprocess to
  Participant
- **THEN** the Subprocess head disappears, and Assignment and Form appear

### Requirement: The bench renders from compiled styles

The steps register, the masthead, the section register and the ribbon's
own chrome SHALL render from compiled component styles, reading
`form-ui/tokens.stylex`. No literal class name appears in any of the four
beyond the `.btn` family and the three exceptions `web-styling` pins.

Every string a person reads in the four SHALL come from the studio catalog.
That includes the no-assignment warning, the section names, and the
terminal step's one-line explanation.

#### Scenario: The bench carries no stray literal class

- **WHEN** a browser renders the bench
- **THEN** no element inside the four regions carries a literal class
  beyond the `.btn` family, `canvas-node`, `panzoom-exclude` and
  `studio-dialog`

#### Scenario: The no-assignment warning reads from the catalog

- **WHEN** the developer selects a non-terminal step with no assignment
- **THEN** the warning's text resolves through the studio catalog's `t`
