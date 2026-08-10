# studio-canvas Specification

## Purpose

Interactive graph editing on the studio area of `packages/web`'s `/processes/:id/edit` screen
(see `studio-app`): a hand-rolled SVG canvas, not Mermaid and not a
graph-editing library, positioning steps by the draft's `layout` and letting
an author drag to reposition a step or drag-to-connect a path between two
steps. Node position writes to `EditorArea`'s `saveState.layout` (see
`process-drafts` for the server-side `layout` storage contract); path
creation writes through the Draft model's `mutate()`, the same surface
`PathsPanel`'s own "add path" action uses. Connection validity reuses
`checkPathTriggerConsistency` (see `definition-contract`) rather than
re-implementing the all-manual-or-all-automatic rule. The canvas adds no
authoring operation the panels can't already do — it is a faster way to
position and connect, not a new capability surface.
## Requirements
### Requirement: Step nodes are repositioned by dragging, and position persists as draft layout

<!-- antislop: allow synonym-rotation -->
<!-- "edit" in this file's later "canvas edit screen" term names a distinct UI surface, not a synonym choice against "update"/"change" below. -->
The canvas SHALL render each step of the loaded draft as a node positioned by
the draft's `layout` (`{ [stepId]: { x, y } }`, per `process-drafts`) and
SHALL let the user drag a node to a new position. A drag SHALL update
`layout` through the same local state (`EditorArea`'s `saveState`) that
`DraftToolbar` already reads for save — layout is not part of the Draft
model's `mutate()` surface panels use for body edits, since position was
never body — so the change is included in the draft's next save the same way
a `saveState.layout` change from any other source would be.

#### Scenario: Dragging a step updates local state

- **WHEN** a step node is dragged to a new position and released
- **THEN** `saveState.layout`'s entry for that step id reflects the new
  `{x, y}` before any save is issued

#### Scenario: A dragged position survives save and reload

- **WHEN** a step is dragged, the draft is saved, and the process is reopened
- **THEN** the step renders at the saved position

### Requirement: A step with no recorded layout position is auto-placed on load, without writing to the draft

A step id absent from the loaded draft's `layout` SHALL be given a
deterministic on-screen position, computed client-side from a breadth-first
traversal by depth from `initialStep` (depth selects the column, traversal
order among siblings at the same depth selects the row). This computed
position SHALL be used for rendering only and SHALL NOT be written into
`layout` — a save issued before that step is ever dragged
SHALL persist `layout` unchanged for that step id (absent, per
`process-drafts`' existing tolerance for partial layout), not the computed
default.

#### Scenario: An empty layout still renders every step at a distinct position

- **WHEN** a draft with `layout: {}` and three or more steps is opened
- **THEN** every step renders at a computed position and no two steps
  occupy the same coordinates

#### Scenario: An untouched auto-placed step is not persisted

- **WHEN** a draft with a step absent from `layout` is opened, an unrelated
  field is edited through a panel, and the draft is saved
- **THEN** the saved `layout` still has no entry for that step id

#### Scenario: Dragging an auto-placed step persists only that step

- **WHEN** a draft has two steps absent from `layout`, and only one of them
  is dragged before save
- **THEN** the saved `layout` has an entry for the dragged step and still no
  entry for the other

### Requirement: Dragging to a step creates a path; dragging to empty canvas creates a step and a path

The canvas SHALL offer a connect handle on each step node. Releasing a
drag started from a terminal step's handle SHALL create neither a step
nor a path. This holds no matter where the release lands. It SHALL
surface the same inline rejection other rejected gestures already
surface. This check runs before any other check the gesture would
otherwise run.

The handle SHALL also carry a non-interactive visual state on a
terminal step. The rejection SHALL NOT be the first signal an author
sees.

A drag from a non-terminal step's handle can still target another step.
Releasing it there SHALL create a path from the source to the target.
It SHALL use the same path-creation method `PathsPanel`'s own "add
path" action already calls. It SHALL default to that step's existing
trigger type (manual or automatic) when one is already set.

Releasing a connect-handle drag over empty canvas SHALL first check
the candidate path's trigger consistency. This is the same
`checkConnection` check the drag-to-a-step gesture already runs.

When that check rejects the candidate, the release SHALL create
neither a step nor a path. It SHALL surface the same inline rejection
the drag-to-a-step gesture already shows for a rejected candidate.

When that check accepts the candidate, the release SHALL create a new
step at the drop point. It SHALL then create a path from the source
step to that new step. Both SHALL use the same methods `StepsPanel`'s
"add step" button and `PathsPanel`'s "add path" action already call.
Creating the step before the path means a rejected candidate never
leaves a step behind with no path to it.

#### Scenario: A completed drag to an existing step creates a path

- **WHEN** a connect-handle drag starts on step A
- **AND** the developer releases the drag over step B
- **THEN** a path from A to B exists in the Draft model, creatable
  through the same call `PathsPanel` uses

#### Scenario: A completed drag to empty canvas creates a step and a path

- **WHEN** a connect-handle drag starts on step A
- **AND** the developer releases the drag over empty canvas
- **AND** the candidate path's trigger consistency passes
- **THEN** a new step exists at the drop point
- **AND** a path from A to that new step exists in the Draft model

#### Scenario: A trigger-inconsistent drag to empty canvas creates nothing

- **WHEN** a connect-handle drag starts on step A, which already carries
  an automatic path with no `priority`
- **AND** the developer releases the drag over empty canvas
- **THEN** no new step exists at the drop point
- **AND** no new path exists in the Draft model
- **AND** the same inline rejection the drag-to-a-step gesture shows
  for a trigger-inconsistent candidate appears

#### Scenario: A drag from a terminal step's handle creates nothing

- **WHEN** a connect-handle drag starts on a terminal step
- **AND** the developer releases the drag over another step
- **THEN** no new path exists in the Draft model
- **AND** an inline rejection appears at the drop point

#### Scenario: A drag from a terminal step's handle to empty canvas creates nothing

- **WHEN** a connect-handle drag starts on a terminal step
- **AND** the developer releases the drag over empty canvas
- **THEN** no new step and no new path exist in the Draft model
- **AND** an inline rejection appears at the drop point

#### Scenario: A terminal step's connect handle renders as non-interactive

- **WHEN** the canvas renders a terminal step
- **THEN** that step's connect handle carries a visual state distinct
  from a non-terminal step's handle

### Requirement: A connection that would break the all-manual-or-all-automatic rule is rejected inline

Before creating a path from a drag-to-connect drop, the canvas SHALL check
the candidate against the same trigger-consistency and priority-uniqueness
rule the engine's structural validation already enforces (a step's paths are
all-manual or all-automatic; automatic paths carry a unique `priority`),
using one shared predicate rather than a re-implementation. A candidate that
violates it SHALL be rejected — no path created — and the reason SHALL be
shown at the drop location.

#### Scenario: A manual connection is rejected on an all-automatic step

- **WHEN** a drag-to-connect drop targets a source step whose existing paths
  are all automatic, offered as a manual path
- **THEN** no path is created and a reason is shown at the drop point

#### Scenario: An automatic connection is rejected on an all-manual step

- **WHEN** a drag-to-connect drop targets a source step whose existing paths
  are all manual, offered as an automatic path
- **THEN** no path is created and a reason is shown at the drop point

#### Scenario: A consistent connection succeeds

- **WHEN** a drag-to-connect drop's trigger type matches the source step's
  existing paths (or the source step has no paths yet)
- **THEN** the path is created

### Requirement: A terminal step disables the inspector's "add path" control

The paths section's "add path" control SHALL disable when the selected
step carries `terminal: true`. This extends the control's existing
disabled condition, which already covers the case of no step to
target. Both share one reason: the resulting draft could never
publish.

#### Scenario: A terminal step disables the add-path control

- **WHEN** the developer selects a terminal step and opens its paths
  section
- **THEN** the "add path" control renders disabled

#### Scenario: A non-terminal step keeps the add-path control enabled

- **WHEN** the developer selects a non-terminal step, in a process with
  at least one other step
- **THEN** the "add path" control renders enabled

### Requirement: Path lines visually encode trigger type, automatic-path priority, and terminal outcomes

An automatic path SHALL render as a solid line and a manual path as a dashed
line. Among a step's automatic paths, each guarded path SHALL show its
`priority` as a badge and the guardless default path (if present) SHALL show
an "else" marker instead of a number. A terminal step (no outgoing paths)
bound to a contract `outcome` SHALL render a distinct marker carrying that
outcome's key; a terminal step with no bound outcome SHALL render as terminal
without an outcome key.

#### Scenario: Automatic and manual paths are visually distinct

- **WHEN** a step has an automatic path and, on a different step, a manual
  path
- **THEN** the automatic path renders solid and the manual path renders
  dashed

#### Scenario: Automatic path priority is visible

- **WHEN** a step has two guarded automatic paths and one guardless default
- **THEN** the guarded paths each show their `priority` and the default
  shows "else" instead of a number

#### Scenario: A terminal step shows its bound outcome

- **WHEN** a terminal step is bound to an `outcome` in a contracted process
- **THEN** the step renders the terminal marker carrying that outcome's key

### Requirement: Selecting a node or edge shows its detail in a permanent, selection-driven inspector beside the canvas

`StepsPanel` SHALL mount as a fixed-width column in the canvas edit
screen's third position. It replaces the `studio-checks-rail`
capability's checks rail there whenever the developer selects a step or
a path.

When the developer selects no step and no path, the third column SHALL
show the checks rail. It SHALL NOT show the inspector at all in that
state.

Selecting a step node on the canvas SHALL show that one step's sections
in the inspector. This replaces the checks rail, and any prior step's or
path's sections. Each section SHALL carry its own entity count. The
sections are identity (key, label, description, type, terminal,
outcome), assignment, paths, timers, actions, subprocess spec, and view.

The inspector SHALL carry every section the step card body holds today.
It SHALL NOT drop the assignment section. `studio-app` requires a
no-assignment warning beside the assignment editor. That requirement
has no anchor without the section.

The identity section SHALL keep the missing-translation warning beside
the step's label input and beside its description input. Those are two
of the six `LocalizedTextInput` sites `studio-app` requires a warning
at.

The identity section SHALL also carry a control to set the selected
step as the draft's `initialStep`. Today only `StepsPanel`'s
always-visible select, above its step list, controls
`workflow.initialStep`. The no-selection state removes that list, so
the control moves into the identity section instead.

The subprocess spec section SHALL keep the cross-process check fieldset
beside the spec editor. That fieldset holds the file input which loads a
child body, and `checkSubprocessChildRefs` runs against nothing without
it. Dropping the fieldset would leave that check with no route.

Selecting a path edge SHALL resolve to its *source* step and show that
step's inspector the same way. A path is not independently addressable.
It only exists nested under its step. The selected path's own row
SHALL also highlight within the expanded paths section, through a new
`selectedPathId` prop on `PathsPanel`.

Choosing any section other than view SHALL expand that one section within
the inspector. Every other section stays collapsed. `StepsPanel` already
nests `PathsPanel` under the paths section. No panel's own fields,
validation, or mutation logic SHALL differ from today's. Only how an
author reaches each section is different.

Choosing the view entry SHALL instead navigate to the form editor's
routed page (see the `studio-form-editor` capability). A step's form
benefits from a full-screen page of its own, not an inline scroll
target. This is the one section entry that navigates away instead of
expanding inline. `StepsPanel` SHALL hold no inline view section. The
inspector then carries one route to a step's view, not two.

A section entry is a disclosure. It SHALL therefore be a
`<button type="button">`. It SHALL carry `aria-expanded` for its own
state, and `aria-controls` naming the section it opens. The
`spa-accessibility` capability requires that shape of every disclosure.

The view entry navigates rather than opening a dialog or a section. It
SHALL carry no `aria-haspopup` and no `aria-controls`. A disclosure's
`aria-expanded` describes a region the document already holds. A
navigation target is not that region either.

Creating the first step in an empty draft SHALL NOT depend on a prior
selection. The palette stays reachable regardless of selection; see
the palette requirement below.

The checks rail's own no-selection presentation carries no "+ Add step"
button. The palette's Step entry is the sole always-reachable way to add
the first step; see the palette requirement below.

#### Scenario: An empty draft with nothing selected shows the checks rail

- **WHEN** a draft with no step selected and no path selected is open
- **THEN** the third column shows the checks rail, not the inspector

#### Scenario: Selecting a step shows its sections

- **WHEN** the developer clicks a step node on the canvas
- **THEN** the inspector shows that step's sections with their entity
  counts, replacing whatever the third column showed before

#### Scenario: Choosing a non-view section expands it inline

- **WHEN** the developer chooses the identity, assignment, paths,
  timers, actions, or subprocess spec entry for the selected step
- **THEN** the inspector expands that section, and every other section
  stays collapsed

#### Scenario: The inspector carries the assignment section

- **WHEN** the developer selects a non-terminal step carrying no
  `assignment`
- **THEN** the inspector lists an assignment section, and choosing it
  expands the assignment editor with its no-assignment warning beside
  it

#### Scenario: The identity section keeps its translation warnings

- **WHEN** the studio's `contentLocale` is `de`, a step's `label`
  carries the base-locale value but no `de` value, and the developer
  chooses the identity section
- **THEN** the missing-translation warning renders beside that step's
  label input

#### Scenario: The identity section sets the draft's initial step

- **WHEN** the developer chooses the identity section for a selected
  step and activates its "set as initial step" control
- **THEN** the draft's `workflow.initialStep` names that step's id

#### Scenario: The subprocess spec section keeps the cross-process check

- **WHEN** the developer selects a step of type `subprocess` and chooses
  the subprocess spec section
- **THEN** the cross-process check fieldset renders beside the spec
  editor, and its file input still loads a child body

#### Scenario: The step issue count covers an issue on its path

- **WHEN** a step carries no issue of its own and one of its paths
  carries a guard that fails validation
- **THEN** the inspector reports one issue for that step

#### Scenario: A section entry expands with the keyboard

- **WHEN** a keyboard user tabs to a non-view section entry and presses
  Enter or Space
- **THEN** the section expands, `aria-expanded` reads true, and pressing
  again collapses it

#### Scenario: Choosing the view entry opens the form editor

- **WHEN** the developer chooses the view entry for the selected step
- **THEN** the form editor's routed page opens for that step, and no
  section expands inline within the inspector

#### Scenario: Selecting a path edge shows its source step's inspector

- **WHEN** the developer clicks a path edge on the canvas
- **THEN** the inspector shows the section list for that edge's source
  step
- **AND** the clicked path's own row highlights within the paths
  section

#### Scenario: Deselecting swaps the column back to the checks rail

- **WHEN** the developer clicks empty canvas space while a step or path
  stays selected
- **THEN** the third column shows the checks rail again, not the
  inspector

#### Scenario: A first step is addable with nothing selected

- **WHEN** an empty draft has no step, and the developer has selected
  nothing
- **THEN** the palette's Step entry stays visible and usable
### Requirement: The canvas supports pan and zoom over the process graph

The canvas SHALL support panning by dragging empty canvas space. The canvas
SHALL support zooming through scroll or wheel input. The canvas SHALL offer a
"fit to view" control that frames every step. This SHALL reuse
`@panzoom/panzoom`. `packages/editor`'s read-only graph view used that same
library for the same purpose, before this repository dropped
`packages/editor`.

"Fit to view" SHALL frame every step at whatever zoom level it selects. The
control SHALL reduce the zoom level for a graph too wide at level 1. Every
step SHALL still land inside the visible area.

The result SHALL NOT depend on the pan and zoom state the author starts from.
Two activations in a row SHALL leave the same framing.

Only the canvas edge SHALL clip the graph. No element between the two SHALL.
A step outside the drawing surface's own bounds SHALL still come into view.
It comes into view once the zoom level drops far enough to hold it.

The framed area SHALL cover more than the step rectangles. It SHALL cover
what a step draws beside its rectangle. That includes the start arrow and
the start stamp beside the initial step. It also includes the terminal
stamp above a terminal step. It SHALL also keep the framed content clear of
any control the canvas overlays on itself, such as the toolbar.

The entire visible canvas area SHALL stay interactive for panning and
zooming. This holds at any pan or zoom state the canvas currently holds. A
drag or a scroll started anywhere inside the visible canvas SHALL move or
scale the graph the same way. This holds regardless of where the graph
itself currently sits, or how much the current zoom level has shrunk it.

#### Scenario: Fit to view frames all steps

- **WHEN** an author activates "fit to view"
- **THEN** every step in the current draft is within the visible canvas area

#### Scenario: Fit to view frames a graph wider than the canvas

- **WHEN** an author activates "fit to view" on a canvas too narrow for the
  graph at zoom level 1
- **THEN** every step sits inside the visible canvas area, with no step
  clipped at an edge

#### Scenario: Fit to view frames a graph outside the drawing surface

- **WHEN** a draft holds steps beyond the drawing surface's own bounds, and an
  author activates "fit to view"
- **THEN** every step renders inside the visible canvas area, at whatever
  reduced zoom level holds them all

#### Scenario: Fit to view repeats without drift

- **WHEN** an author activates "fit to view" twice in a row
- **THEN** the second activation leaves the same zoom level and the same pan
  offset as the first

#### Scenario: Fit to view keeps the toolbar off the graph

- **WHEN** an author activates "fit to view"
- **THEN** no step, start arrow, start stamp or terminal stamp comes to rest
  under the toolbar

#### Scenario: Panning works from the margin a zoomed-out graph leaves behind

- **WHEN** "fit to view" has reduced the zoom level, leaving empty canvas
  space between the graph and the canvas edge
- **AND** an author starts a drag inside that empty space, on any side of
  the graph
- **THEN** the drag pans the graph, the same as a drag started over the
  graph itself

#### Scenario: Zooming by wheel works from anywhere over the canvas

- **WHEN** the current pan and zoom state leaves empty canvas space beside
  the graph
- **AND** an author scrolls the wheel while pointing at that empty space
- **THEN** the graph zooms, the same as a wheel scroll pointed at the graph
  itself

#### Scenario: The toolbar keeps its own click and scroll behavior

- **WHEN** an author clicks "Fit to view", or scrolls the wheel while
  pointing at the toolbar
- **THEN** the click activates "Fit to view" and the scroll does not pan or
  zoom the graph

### Requirement: The canvas centers the graph automatically the first time a draft's steps render

The canvas SHALL run the "fit to view" computation once, automatically, the
first time a loaded draft's steps render. The author need not activate the
control for this first pass.

The automatic pass SHALL create the same framing an explicit "fit to view"
activation creates. Only the timing differs.

Once the automatic pass has run, the canvas SHALL leave pan and zoom alone
for the rest of that mount. Adding, moving, or removing a step afterward
SHALL NOT trigger it again. An author's own pan or zoom survives a later
edit.

A draft with no steps yet SHALL leave the canvas at its default pan and
zoom. The automatic pass SHALL wait for the first step to exist rather than
running against nothing.

The automatic pass SHALL leave the same full visible canvas area
interactive as any other pan or zoom state does. An author opening a draft
SHALL be able to pan or zoom from the first frame. No action of their own
comes first.

#### Scenario: A draft with steps centers on open, with no author action

- **WHEN** the author opens a draft holding one or more steps
- **THEN** the canvas renders already framed, matching an explicit
  "fit to view" activation, with no action from the author

#### Scenario: A later edit does not re-trigger the automatic fit

- **WHEN** the automatic fit has already run
- **AND** the author pans, zooms, or edits the graph afterward
- **THEN** no further automatic fit occurs during that mount
- **AND** the author's own pan and zoom state persists

#### Scenario: An empty draft renders with no automatic fit

- **WHEN** the author opens a draft with no steps yet
- **THEN** the canvas renders at its default pan and zoom
- **AND** the automatic fit runs only once the first step exists

#### Scenario: The canvas is fully interactive right after the automatic fit

- **WHEN** the automatic fit has just run on opening a draft
- **AND** the author starts a drag in canvas space the automatic fit left
  empty beside the graph
- **THEN** the drag pans the graph

### Requirement: The canvas introduces no authoring operation unavailable through the panels

Every mutation the canvas can trigger (positioning a step, connecting a
path) SHALL have an existing panel-based equivalent; the canvas SHALL NOT be
the only way to perform any authoring operation, including deletion, which
SHALL remain panel-only.

#### Scenario: A step and its paths remain deletable without the canvas

- **WHEN** a step or path is deleted through its panel
- **THEN** the deletion succeeds identically to before this change, with no
  canvas-only deletion affordance introduced

### Requirement: Canvas interaction logic is tested as pure functions, independent of rendering

Five computations SHALL live in pure modules with `bun:test` coverage. Those
are hit-testing, drag-delta computation, the auto-place traversal, the
connection-validity predicate and the fit-to-view computation.
`packages/web/src/areas/app/screens/inboxLogic.ts` sets that convention. The
tests need not cover the SVG rendering or the pointer-event wiring.

#### Scenario: Connection validity holds without rendering

- **WHEN** a test gives the connection-validity predicate a step's existing
  paths and a candidate path
- **THEN** it returns accept or reject-with-reason, and the test needs no DOM
  or canvas rendering

#### Scenario: The fit computation holds without rendering

- **WHEN** a test gives the fit-to-view computation a content bounding box and
  a viewport size
- **THEN** it returns a zoom level and a pan offset, and the test needs no DOM
  or canvas rendering

### Requirement: Layout computation does not re-run on pointer movement

The canvas's auto-placement result and its derived node positions SHALL be
memoized on their actual inputs (the steps, the initial step id, and the
stored layout), so that a drag — which updates pointer state many times per
second — does not recompute them.

Neither computation reads the drag state, so recomputing them per pointer
event is pure waste on the one surface where a dropped frame is most visible.
The scale is bounded in practice (auto-placement early-returns once every step
has a recorded position, and its traversal is small on realistic processes),
which is why this is a targeted memoization and not a rendering rework.

Further memoization of the per-node and per-edge subtrees SHALL be driven by
a profile rather than added speculatively.

#### Scenario: Dragging a node does not recompute the layout

- **WHEN** a node is dragged across the canvas
- **THEN** the auto-placement and node-position computations are not re-run
  for each pointer event

#### Scenario: Changing the graph does recompute it

- **WHEN** a step is added, removed, or repositioned in the stored layout
- **THEN** the computations re-run and the canvas reflects the change

### Requirement: The canvas edit screen lays out a palette, the canvas, the inspector, and a checks rail

The canvas edit screen SHALL show three columns, in order. The first is
a rail. It holds the place-on-canvas palette. Below the palette sits the
`studio-app` capability's Process section: the Fields, Data sources, and
Contract links.

The second column is the canvas. The third column shows either the
`studio-checks-rail` capability's checks rail or the selection-driven
inspector, never both at once.

The third column SHALL show the checks rail when the developer has
selected no step and no path. It SHALL show the inspector when the
developer selects a step or a path. See the `studio-checks-rail`
capability for the rail's own collapsed presentation in the
step-selected state.

#### Scenario: All three columns appear

- **WHEN** the canvas edit screen loads
- **THEN** the rail, the canvas, and the third column each appear as
  their own column

#### Scenario: The third column shows the checks rail with nothing selected

- **WHEN** the developer has selected no step and no path
- **THEN** the third column shows the checks rail, not the inspector

#### Scenario: The third column shows the inspector once the developer selects a step

- **WHEN** the developer selects a step or a path
- **THEN** the third column shows the inspector, not the full checks
  rail

### Requirement: A palette offers Step, Subprocess, and End as an always-available way to add a step

The canvas edit screen SHALL show a palette listing Step, Subprocess, and
End. Each entry SHALL be a drag source. Dragging one onto the canvas
SHALL add a step of that kind at the drop point. That SHALL use
the same Draft-mutation method `StepsPanel`'s own "add step" action
already calls.

The palette SHALL stay visible and usable regardless of canvas selection.

#### Scenario: Dragging a palette entry adds a step

- **WHEN** the developer drags the Step entry from the palette onto the
  canvas
- **THEN** a new step of type `task` exists at the drop point
- **AND** it is added through the same method `StepsPanel`'s "add step"
  action calls

#### Scenario: The palette works with nothing selected

- **WHEN** the developer selects nothing on the canvas
- **THEN** every palette entry stays visible and usable

### Requirement: A process-identity header bar shows draft and publish status

The canvas edit screen SHALL show a header bar above the three-column
layout. It SHALL show the process name and the key in the mono face.
It SHALL also show the draft's revision badge and dirty state. It SHALL
show the version and hash after a publish. `EditorArea` computes all of
these as controlled props. It already lifts `saveState` the same way.

The header bar SHALL also show a last-saved time. That time is
client-only state. `EditorArea` sets it on every successful save.

The header bar SHALL show the content-locale badge the `studio-app`
capability's content-locale-switcher requirement governs. It SHALL also
show the Structure/JSON toggle.

<!-- antislop: allow synonym-rotation -->
<!-- "Discard" below is the literal button label `DraftToolbar` renders, not a synonym choice against "remove" elsewhere in this file. -->
The header bar SHALL show a `⋮` overflow menu. The menu SHALL hold
`DraftToolbar`'s Save, Discard draft, and Publish actions.
`DraftToolbar` SHALL keep computing when each action is available and
what each one does. The menu calls that logic. The menu holds no save,
discard, or publish logic of its own.

The menu SHALL group its remaining controls under two headings. "Process,
saved with the draft" SHALL hold the editable process key and the
base-locale control the `studio-app` capability's base-locale
requirement governs. "This session only" SHALL hold the `RegistryPanel`
action-registry selector, with a caption stating it is never written to
the draft.

The header bar's summary fields SHALL stay a read-only pass-through of
state `EditorArea` owns. Those fields are the process name, the revision
badge, the dirty state, and the published version and hash. None of
them carries logic of its own.

#### Scenario: The header bar shows an unsaved draft's state

- **WHEN** the draft has unsaved changes
- **THEN** the header bar shows the process name, the draft's revision
  badge, and a dirty indicator

#### Scenario: The header bar shows a just-published version

- **WHEN** a publish succeeds
- **THEN** the header bar shows the published version and its hash
  prefix

#### Scenario: The overflow menu invokes DraftToolbar's own save

- **WHEN** the developer chooses Save from the `⋮` menu
- **THEN** the draft saves through `DraftToolbar`'s existing save call

#### Scenario: The overflow menu separates persisted settings from session-only settings

- **WHEN** the developer opens the `⋮` menu
- **THEN** the key and base-locale control appear under "Process, saved
  with the draft"
- **AND** the action-registry selector appears under "This session only"

### Requirement: A step node on the canvas offers an inline rename

The canvas SHALL let the developer rename a step's label directly on
its node, without opening the inspector's identity section. Committing
the rename SHALL write `step.label` through the same Draft mutation the
identity section's label input already calls.

#### Scenario: Double-clicking a node's label opens an inline text field

- **WHEN** the developer double-clicks a step node's label on the canvas
- **THEN** a text field opens on the node, seeded with the step's current
  label

#### Scenario: Committing the inline rename updates the step's label

- **WHEN** the developer edits a node's inline text field and commits it
- **THEN** the step's `label` updates through the same Draft mutation the
  identity section's label input calls

### Requirement: The identity section's type and terminal controls render as a "performed by" segmented control

The identity section SHALL render the step's existing `type` and
`terminal` fields as a three-option segmented control, labeled
"performed by". The options are participant (type `task`), subprocess
(type `subprocess`), and nothing/terminal. This SHALL set the same
fields the identity section's type control sets today; it adds no new
field.

#### Scenario: Choosing a "performed by" option sets the step's type

- **WHEN** the developer selects the subprocess option in a step's
  "performed by" control
- **THEN** the step's `type` becomes `subprocess`, the same field the
  identity section's type control already sets

<!-- antislop: allow synonym-rotation -->
<!-- "Build the form" below is a literal UI label, not a synonym choice against "create" elsewhere in this file. -->
### Requirement: The view entry shows form status and a "Build the form" label

The view entry SHALL show a status summary of the step's form. For
example, the summary might read how many fields carry a view entry.
It SHALL also show a "Build the form" label alongside that summary.

This changes the entry's copy only. Choosing it still navigates to the
form editor's routed page, per the view-entry requirement above. No
section expands inline.

#### Scenario: The view entry shows a form-status summary

- **WHEN** the developer selects a step carrying a partially configured
  view
- **THEN** the view entry shows a status summary of the form and a
  "Build the form" label

### Requirement: The step inspector's "Developer view" discloses the step's raw data

The step inspector SHALL carry a collapsible "Developer view"
disclosure, an eighth entry beside the seven content sections. Expanding
it SHALL show the selected step's raw JSON. This is a read-only view;
it is distinct from the path-guard's CEL "Developer view" toggle the
`studio-condition-builder` capability describes.

#### Scenario: The step inspector's "Developer view" shows raw JSON

- **WHEN** the developer expands a selected step's "Developer view"
  disclosure
- **THEN** the step's raw underlying JSON renders read-only

### Requirement: The initial step shows a distinct stamp

The canvas SHALL draw a stamp on the node of the draft's
`workflow.initialStep`, distinct from a terminal step's outcome stamp. This
lets an author identify the process's entry point from the canvas alone. An
author needs no JSON inspection and no per-step identity check.

#### Scenario: The initial step shows its stamp

- **WHEN** a step is the draft's `workflow.initialStep`
- **THEN** the canvas draws that step's stamp, distinct from a terminal
  step's outcome stamp

#### Scenario: Changing the initial step moves the stamp

- **WHEN** the developer sets a different step as `workflow.initialStep`
- **THEN** the stamp moves to the newly chosen step and leaves the previous
  one

#### Scenario: A step that is both initial and terminal shows both stamps

- **WHEN** a step is both the draft's `workflow.initialStep` and terminal
- **THEN** the canvas draws both stamps, in opposite corners, with neither
  stamp obscured by the other

### Requirement: The identity section constrains a terminal step's outcome to the process's declared outcomes

When the draft's contract declares one or more `outcomes`, the identity
section's `outcome` field SHALL offer only those values, not free text.
Without a contract, or with a contract that declares no outcomes, the field
carries no validated meaning. It SHALL stay a free-text field.

#### Scenario: The developer picks an outcome from the declared list

- **WHEN** the developer selects a terminal step on a draft whose contract
  declares one or more outcomes
- **THEN** the identity section's outcome field offers only those declared
  outcomes as choices

#### Scenario: An outcome field stays free text without a declared outcome list

- **WHEN** the developer selects a terminal step on a draft with no
  contract, or a contract that declares no outcomes
- **THEN** the identity section's outcome field accepts any text
