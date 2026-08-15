## MODIFIED Requirements

### Requirement: The canvas edit screen lays out a palette, the canvas, the inspector, and a checks rail

The canvas edit screen SHALL show three columns, in order. The first is
a rail. It holds the place-on-canvas palette. Below the palette sits the
`studio-app` capability's Process section: the Fields, Data sources,
Contract, and Field matrix links.

The second column is the canvas. The third column shows either the
`studio-checks-rail` capability's checks rail or the selection-driven
inspector, never both at once.

The third column SHALL show the checks rail when the developer has
selected no step and no path. It SHALL show the inspector when the
developer selects exactly one step, or a path. It SHALL show the
selection's own count and delete control when the selection holds more
than one step. See the `studio-checks-rail` capability for the rail's own
collapsed presentation in the step-selected state.

Below the three columns, and across their full width, the screen SHALL
show the dock. The dock starts collapsed, and a collapsed dock shows its
control alone.

The screen's own header rows and the dock take their height first. The
three columns SHALL fill what remains, above a floor of 36rem. A window
taller than that floor therefore shows a taller canvas, and no empty band
below the dock. A window shorter than the floor holds the columns at the
floor, and the page scrolls. The columns keep their widths. The two side
columns stay fixed, and the canvas between them takes the rest.

Opening the dock SHALL NOT push the columns below that floor. The dock
takes its height from the columns until they reach 36rem. Past that point
the page scrolls instead.

#### Scenario: All three columns appear

- **WHEN** the canvas edit screen loads
- **THEN** the rail, the canvas, and the third column each appear as
  their own column

#### Scenario: The third column shows the checks rail with nothing selected

- **WHEN** the developer has selected no step and no path
- **THEN** the third column shows the checks rail, not the inspector

#### Scenario: The third column shows the inspector once the developer selects a step

- **WHEN** the developer selects one step, or a path
- **THEN** the third column shows the inspector, not the full checks
  rail

#### Scenario: The third column shows the count with several steps selected

- **WHEN** the developer selects more than one step
- **THEN** the third column shows the selection count and its delete
  control
- **AND** it shows neither the inspector nor the full checks rail

#### Scenario: A tall window grows the columns rather than leaving a band below them

- **WHEN** the canvas edit screen loads in a window whose remaining height
  is above the floor
- **THEN** the three columns end at the top edge of the collapsed dock,
  and the canvas is taller than 36rem

#### Scenario: A short window holds the columns at the floor

- **WHEN** the canvas edit screen loads in a window whose remaining height
  is below the floor
- **THEN** the three columns keep the 36rem floor and the page scrolls to
  reach their bottom edge

#### Scenario: An open dock takes height from the columns down to the floor

- **WHEN** the developer opens the dock in a window whose remaining height
  is well above the floor
- **THEN** the columns lose the dock's height and stay at or above 36rem
- **AND** the canvas stays visible above the dock

## ADDED Requirements

### Requirement: A dock below the canvas columns collapses and opens

The canvas edit screen SHALL carry a dock. It is one strip below the three
columns, and it spans their full width. A control on the dock opens it and
closes it. The dock starts collapsed on every load of the screen.

<!-- antislop: allow synonym-rotation -->
<!-- Why: CLAUDE.md fixes "surface" as a domain term with no synonym, and
     `.claude/rules/ui-glossary.md` fixes "JSON surface" as this view's one
     name. The rule reads that word as a synonym for "show". -->
The screen SHALL show the dock in the canvas sub-state of the Structure
surface alone. The form editor and the panels screen each replace the
canvas, so neither one shows the dock. The screen SHALL show no dock while
the JSON surface is active either. The dock's Field matrix tab mutates the
draft body, and `studio-json-view` keeps every such component out of reach
there.

The dock's control SHALL be a `<button type="button">`. It carries
`aria-expanded` for its own state, and `aria-controls` naming the dock's
body. `spa-accessibility` asks a disclosure for all three.

The dock SHALL persist neither its open state nor its active tab. Both live
in the screen's own component state. They survive a new canvas selection,
and a reload returns the dock to collapsed.

The draft's `layout` blob SHALL carry no key for the dock. That blob rides
the draft body, so a stored open state would reach every author of that
draft.

#### Scenario: The dock starts collapsed

- **WHEN** the developer opens the canvas edit screen
- **THEN** the dock shows its control and no tab body

#### Scenario: The control opens and closes the dock

- **WHEN** the developer activates the dock's control
- **THEN** the dock shows the active tab's body
- **AND** activating the control again hides that body

#### Scenario: The dock survives a new canvas selection

- **WHEN** the developer opens the dock and then selects a step
- **THEN** the dock stays open on the same tab

#### Scenario: A reload returns the dock to collapsed

- **WHEN** the developer opens the dock and then reloads the screen
- **THEN** the dock shows its control and no tab body

#### Scenario: The form editor and the panels screen show no dock

- **WHEN** the developer opens the form editor or the panels screen
- **THEN** neither screen shows the dock

#### Scenario: The JSON surface shows no dock

- **WHEN** the developer switches to the JSON surface
- **THEN** the screen shows no dock, neither a tab body nor the control

#### Scenario: The control states what it discloses

- **WHEN** the dock renders, collapsed or open
- **THEN** its control is a `<button type="button">` carrying
  `aria-expanded` for its state
- **AND** it carries `aria-controls` naming the dock's body

#### Scenario: Saving a draft writes no dock state

- **WHEN** the developer opens the dock and saves the draft
- **THEN** the saved `layout` blob carries no key naming the dock

### Requirement: The dock offers three tabs, one active at a time

The dock SHALL offer three tabs, in this order: Changes, Field matrix and
Paths. Exactly one tab is active. Opening the dock for the first time shows
the first tab.

Each tab body SHALL scroll inside the dock's own bounded height. The dock
never grows to fit its content, and the page never scrolls sideways because
of a tab.

Neither the Paths tab nor the Field matrix tab offers a filter. Both scroll
instead.

#### Scenario: The first tab is active on the first open

- **WHEN** the developer opens the dock for the first time on a screen
- **THEN** the Changes tab is active

#### Scenario: Selecting a tab replaces the body

- **WHEN** the developer selects the Paths tab
- **THEN** the dock shows the Paths body, and it hides the Changes body

#### Scenario: A long body scrolls inside the dock

- **WHEN** a tab's content is taller than the dock
- **THEN** that body scrolls inside the dock, and the dock keeps its
  height

<!-- antislop: allow synonym-rotation -->
<!-- Why: "Changes" is this tab's own name, and "change" is what a publish
     does to a published version. The rule reads both as synonyms for the
     "edit" in "canvas edit screen", which names a screen. -->
### Requirement: The Changes tab shows what a publish would change

The Changes tab SHALL show the difference between the draft and the version
the draft sits on. It answers the question a publish raises, and the
developer stays on the canvas to read it.

The tab SHALL read the draft as the editor holds it, including edits the
developer has not saved. The `process-version-inspection` capability's
versions screen reads the saved draft from the server instead.

Both use one difference computation. The tab SHALL pass the base version
first and the draft second. Every entry then runs from the published value
toward the draft value, the direction a publish moves.

That order decides how an entry reads. A key the draft adds reads as added,
and a key it drops reads as removed. The reverse order inverts both, and it
prints a changed entry's two values the wrong way round.

A list compares whole. The difference computation treats an array as one
value. A draft that adds one catalog field reports one changed entry over
that whole list. It reports no added entry.

The tab SHALL strip the compiled content from the base version's body
first. The versions screen gives that body the same treatment. The compile
pass injects a cancel sink, and no developer authored it.

A process with no base version SHALL read as a first publish. The tab says
so, and it shows no difference.

An empty difference SHALL read as such. The tab says the draft matches its
base version.

#### Scenario: A draft over a published version shows its difference

- **WHEN** the developer opens the Changes tab on a draft of a published
  process
- **THEN** the tab shows what the draft changes against its base version

#### Scenario: An unsaved edit reaches the tab

- **WHEN** the developer renames a step and opens the Changes tab without
  saving
- **THEN** the tab lists that rename
- **AND** the entry's first value is the published label, and its second is
  the unsaved one

#### Scenario: A publish moves the base and the tab follows it

- **WHEN** the developer publishes the draft from the header bar with the
  Changes tab open
- **THEN** the tab reads the newly published version, with no reload
- **AND** it reports that the draft matches that version

#### Scenario: A never-published process reads as a first publish

- **WHEN** the developer opens the Changes tab on a process with no base
  version
- **THEN** the tab says the publish would be the first one, and it shows
  no difference

#### Scenario: A draft matching its base reads as no difference

- **WHEN** the developer opens the Changes tab on a draft nobody has edited
  since it seeded from its base version
- **THEN** the tab says the draft matches that version

### Requirement: The Field matrix tab mounts the field matrix

The Field matrix tab SHALL mount the `studio-app` capability's field
matrix, the grid of every catalog field against every step. The developer
edits a cell's flags there, exactly as on the panels screen.

The panels screen SHALL keep its own field matrix and its route. The dock
adds a second place to reach that grid. It removes none.

#### Scenario: The tab shows the grid

- **WHEN** the developer selects the Field matrix tab
- **THEN** the dock shows the grid of catalog fields against workflow
  steps

#### Scenario: The panels route still reaches the grid

- **WHEN** the developer opens the field matrix view of the panels screen
- **THEN** that screen shows the grid, as it does today

### Requirement: The Paths tab lists every path in the process

The Paths tab SHALL show one row per path across the whole draft. The five
columns are source step, trigger, priority, guard and target. A canvas
draws a path as a line, and a line hides those five values.

Rows SHALL follow the draft's own order. The steps order the rows first,
and each step's own path order orders the rows inside it.

A path with no guard SHALL read as such, and so SHALL a path with no
priority. The tab states each absence rather than leaving a blank cell
unexplained. A guard is independent of the trigger. A manual path can carry
one. That guard decides whether the participant may take the path, so the
tab SHALL show it.

A draft with no path at all SHALL show an empty state naming that fact.

The row derivation SHALL live in a pure module with `bun:test` coverage,
the convention `packages/web/src/areas/app/screens/inboxLogic.ts` sets. It
takes the draft's steps and returns the rows. The test needs no DOM and no
rendering.

#### Scenario: Every path takes a row

- **WHEN** the developer selects the Paths tab on a draft holding four
  steps and five paths
- **THEN** the tab shows five rows

#### Scenario: A row names its source step and its target step

- **WHEN** the tab shows a path's row
- **THEN** that row names the step the path leaves and the step it enters

#### Scenario: A manual path with no guard reads as carrying none

- **WHEN** a step's manual paths carry no guard and no priority
- **THEN** each of their rows reads as carrying no priority and no guard

#### Scenario: A manual path carrying a guard shows it

- **WHEN** a manual path carries a guard
- **THEN** its row shows that guard's CEL source

#### Scenario: An automatic path shows its priority and its guard source

- **WHEN** a step carries two automatic paths, one guarded
- **THEN** each row shows that path's priority
- **AND** the guarded row shows its guard's CEL source

#### Scenario: A draft with no path shows an empty state

- **WHEN** the developer selects the Paths tab on a draft holding no path
- **THEN** the tab says the process has no path yet

#### Scenario: The row derivation holds without rendering

- **WHEN** a test gives the row derivation a list of steps
- **THEN** it returns one row per path, in the draft's own order
- **AND** the test needs no DOM or canvas rendering
