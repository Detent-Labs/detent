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

### Requirement: A step dropped on a path lands inside that path

<!-- Why: "edit rail" is the glossary's one word for the creation palette. -->
<!-- antislop: allow synonym-rotation -->

A release of an edit-rail drag over a rendered path SHALL put the new step
inside that path. The step lands between the path's source step and its
target. The canvas SHALL apply three draft mutations for it, in one commit.

The new step SHALL join `workflow.steps`. The dropped-on path SHALL retarget
its `to` to the new step's id. The new step SHALL take one path, pointing at
the id that path named before.

The retargeted path SHALL keep its `id`, its `key`, its guard and its
priority. It is the same path, and the guard on it still decides whether the
flow enters this branch.

The new path SHALL take the retargeted path's trigger, and nothing else from
it. It SHALL carry no guard and no priority. An automatic chain therefore
stays automatic, and a manual one stays manual.

A guardless automatic path is legal here without a priority. The new step
holds one path, and the priority rule binds two or more.

The insert SHALL clear the retargeted path's stored waypoints. The author
placed them for a route that ended somewhere else. `Arrange` discards
waypoints for that same reason.

The new step SHALL land at the drop point, snapped to the grid. The canvas
SHALL select it. A free-standing drop does both already, and the insert
changes neither.

A step of kind `end` SHALL never land inside a path. A terminal step has no
outgoing path, so it cannot stand between two steps. A release of one over a
path SHALL place it free-standing, which is what it does today.

The topmost element under the pointer SHALL decide. A node draws over a path,
so a release where the two overlap places a free-standing step. A path with no
target draws no edge, so it SHALL never take an insert.

#### Scenario: A task step dropped on a path splits it

- **WHEN** the developer drags a Step from the edit rail
- **AND** releases it over the path from "Submit" to "Approve"
- **THEN** the draft holds a new step at the release point
- **AND** the "Submit" step's path names that new step as its target
- **AND** the new step holds one path naming "Approve"
- **AND** the canvas selects the new step

#### Scenario: The retargeted path keeps its guard and the new path takes the trigger

- **WHEN** the dropped-on path is automatic and carries a guard and priority 10
- **THEN** that path still carries the same guard and priority 10
- **AND** the new path is automatic, with no guard and no priority

#### Scenario: The insert clears the split path's waypoints

- **WHEN** the dropped-on path holds two waypoints in the draft layout
- **THEN** the layout holds none for that path after the insert
- **AND** the new path holds none of its own

#### Scenario: An end step drops free-standing over a path

- **WHEN** the developer releases an End from the edit rail over a path
- **THEN** the draft holds a new terminal step at that point
- **AND** the path names the target it named before

### Requirement: A newly created path defaults to a name derived from its source and target steps

Path creation SHALL no longer default `key` to an empty string. It SHALL
no longer leave `label` absent either. `newPath()` is the one
path-creation method every path-creating gesture calls. Those gestures are
drag-to-connect, `PathsPanel`'s "add path" action, and `insertOnPath.ts`'s
step-dropped-on-a-path gesture. `newPath()` SHALL compute a default `key`
and `label` from the source step and the target step, at the moment of
creation.

The default `label` SHALL name the source step, then an arrow, then the
target step. Each step contributes its own label when it carries one
non-empty after trimming. A step with no such label contributes its key
instead, when the key is non-empty after trimming. A step with neither
contributes the "unnamed step" placeholder.

The default `key` SHALL be a slug built the same way. A side whose name
slugs to an empty string SHALL contribute the placeholder's slug instead.
That way the joined `key` never comes out empty. Neither default
stays in sync with a later rename of either step. Each gets computed
once, at creation. Each stays freely editable afterward, like any other
path field.

A drag to empty canvas creates a new step as part of the same gesture. So
does a step dropped on an existing path. Both leave the new step with an
empty `key` and an empty `label`. The method `newStep()` hardcodes the
one, and its callers seed the other empty. That path's default SHALL come
from the new step's own, likewise defaulted, key and label. It SHALL fall
back to the "unnamed step" placeholder, not to an empty or arrow-only
string.

#### Scenario: A path dragged between two named steps gets a derived label

- **WHEN** a connect-handle drag from step "Manager review" to step
  "Finance sign-off" creates a path
- **THEN** the path's `label` reads "Manager review → Finance sign-off"
- **AND** the path's `key` is a non-empty slug derived from the same two
  steps

#### Scenario: A path between two punctuation-named steps still gets a non-empty key

- **WHEN** a connect-handle drag runs from step "!!!" to step "???"
- **THEN** each side contributes the placeholder's slug, and the path's
  `key` is non-empty

#### Scenario: PathsPanel's "add path" action stays disabled with no target chosen

- **WHEN** the developer opens `PathsPanel` for a step and has not yet
  chosen a target in the new target selector
- **THEN** the "add path" action stays disabled
- **AND** the panel creates no path

#### Scenario: A path added through the Paths tab gets the same derived default

- **WHEN** the developer chooses a target step in `PathsPanel`'s target
  selector, then uses the "add path" action
- **THEN** `newPath()` computes the new path's `key` and `label` from the
  currently selected step and the chosen target
- **AND** this matches how a canvas drag computes them from its own
  source and target
- **AND** neither field ends up empty or absent
- **AND** the target selector resets to no selection, ready for the next
  path

#### Scenario: Renaming a step afterward does not touch an existing path's label

- **WHEN** a path's default `label` came from a step's label at creation
- **AND** the developer later renames that step
- **THEN** the path's `label` stays what it was, unchanged by the rename

#### Scenario: A drag to empty canvas derives its default from the new step

- **WHEN** a connect-handle drag from step A to empty canvas creates both a
  new step and a path to it
- **THEN** `newPath()` derives the path's default `key` and `label` from
  step A and the newly created step's own default key and label

#### Scenario: A path to a freshly created, unnamed step falls back to a placeholder

- **WHEN** a gesture creates a new step with no `key` and no `label`, the
  state its creation leaves it in
- **AND** the same gesture connects a new path to that step
- **AND** a drag to empty canvas makes the new step the target
- **AND** a step dropped on a path makes the new step the source, via
  `insertOnPath.ts` reached from `EditScreen.tsx`
- **THEN** the new path's default `label` names the new step with the
  "unnamed step" placeholder, on whichever side it sits. It is not an
  empty or arrow-only string
- **AND** the placeholder is the same one `CanvasView.tsx`'s own
  `stepLabel()` helper already falls back to

#### Scenario: A path inserted on a path whose target no longer exists falls back for the target side

- **WHEN** the step-dropped-on-a-path gesture runs on a path whose `to`
  names a step the draft no longer holds. This is a pure-function edge.
  The canvas draws no edge for such a path, so the gesture cannot fire
  there in production
- **THEN** the derivation falls back to the "unnamed step" placeholder for
  the target side
- **AND** the new path keeps the original `to` id

### Requirement: A path draws as the drop target under an edit-rail drag

While an edit-rail drag runs, the path under the pointer SHALL render in a
drop-target state. That state is the affordance the gesture has. The canvas
SHALL add no permanent control to an edge for it.

At most one path SHALL carry the state. It SHALL clear on release, and as soon
as the pointer leaves the path.

The state SHALL differ from a plain path in stroke weight as well as in color.
The signal then does not rest on color alone.

A drag carrying an `end` step SHALL draw the state on no path. Such a step
never lands inside one, so nothing may suggest that it does.

The state SHALL NOT move the priority badge or the guard label. It SHALL NOT
add a second control at the route midpoint. A selected path already carries a
waypoint handle there.

#### Scenario: The path under the pointer marks itself

- **WHEN** the developer holds a Step from the edit rail over a path
- **THEN** that path renders in the drop-target state
- **AND** every other path renders unchanged

#### Scenario: The state clears when the pointer moves off

- **WHEN** the pointer moves from the path to empty canvas
- **THEN** no path renders in the drop-target state

#### Scenario: An end step marks nothing

- **WHEN** the developer holds an End from the edit rail over a path
- **THEN** no path renders in the drop-target state

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

### Requirement: Selecting a node or edge shows its detail in a three-zone, tab-driven inspector beside the canvas

<!-- Why: "edit" in this requirement's "canvas edit screen" term names a -->
<!-- distinct UI surface, not a synonym choice against "change" (SHALL/ -->
<!-- state-change wording) elsewhere in this requirement. -->
<!-- antislop: allow synonym-rotation -->

`StepsPanel` SHALL mount as a fixed-width column in the canvas edit
screen's third position. It replaces the `studio-checks-rail`
capability's checks rail there whenever the developer selects exactly
one step, or a path.

When the developer selects no step and no path, the third column SHALL
show the checks rail. It SHALL NOT show the inspector at all in that
state.

A selection of more than one step reaches neither of those two. The
third column SHALL show that selection's own count and delete control
instead. The selection-set requirements above state both.

Selecting a step node on the canvas SHALL show that one step in the
inspector. The inspector SHALL lay the step out in three zones. The
zones are an always-visible identity zone, a tab-driven behavior zone,
and a diagnostics drawer. This replaces the checks rail. It also
replaces any prior step's or path's content.

The identity zone SHALL carry no disclosure. It SHALL always show key,
label, description, a performed-by control, the initial-step control,
and the view button. The performed-by control SHALL offer participant,
subprocess, and terminal. The identity zone SHALL also show an outcome
field when the selected step carries `terminal: true`.

The identity zone SHALL keep the missing-translation warning beside
the step's label input and beside its description input. Those are two
of the six `LocalizedTextInput` sites `studio-app` requires a warning
at.

The identity zone SHALL also carry a control to set the selected step
as the draft's `initialStep`. Today `StepsPanel` renders that control
as a button inside its identity section, hidden until the identity
entry opens. The no-selection state hides the whole panel. The control
moves into the always-visible identity zone instead.

The behavior zone SHALL show a tab row: Assignment, Paths, Actions,
Timers. Subprocess joins that row only when the selected step's
performed-by control reads Subprocess. Exactly one tab's content SHALL
show at a time. Choosing a different tab SHALL replace the shown
content. It SHALL NOT expand a second panel alongside it.

Selecting a step node SHALL show its Assignment tab by default. Moving
the selection to a different step SHALL reset the shown tab back to
Assignment. The one exception: a selection that arrives through a path
edge click selects the Paths tab instead (see below).

Changing the performed-by control away from Subprocess while the
Subprocess tab shows SHALL move the shown tab to Assignment. The
Subprocess tab no longer lists once performed-by reads something
else, so it cannot stay shown.

`StepsPanel` already nests `PathsPanel` under the paths tab. No panel's
own fields, validation, or mutation logic SHALL differ from today's.
Only how an author reaches each panel is different.

The subprocess tab SHALL keep the cross-process check fieldset beside
the spec editor. That fieldset holds the file input which loads a child
body. `checkSubprocessChildRefs` runs against nothing without it.
Dropping the fieldset would leave that check with no route.

A step carrying `terminal: true` SHALL show an empty state on the Paths
tab, in place of a path editor. The empty state SHALL name that a
terminal step has no outgoing paths. A step carrying `terminal: true`
SHALL also suppress the assignment tab's no-assignment warning. Both
mirror the existing rule that already exempts a terminal step from
needing an assignment elsewhere:
`terminal === true || assignment !== undefined`.

Selecting a path edge SHALL resolve to its *source* step. It SHALL show
that step's inspector the same way, with its Paths tab selected. A path
is not independently addressable. It only exists nested under its
step. The selected path's own row SHALL also highlight within the
shown paths tab, through the existing `selectedPathId` prop on
`PathsPanel`.

<!-- Why: "Build the form" below is a literal UI label, not a synonym -->
<!-- choice against "create" elsewhere in this file. -->
<!-- antislop: allow synonym-rotation -->
The view button SHALL navigate to the form editor's routed page (see
the `studio-form-editor` capability). It SHALL NOT be a tab. It SHALL
NOT expand any content in place. It SHALL show a form-status summary
and a "Build the form" label beside that summary. A step's form
benefits from a full-screen page of its own, not an inline scroll
target. This is the inspector's one control that navigates away
instead of showing content in the column.

A behavior-zone tab is a `<button type="button" role="tab">` inside a
`role="tablist"`, carrying `aria-selected` for its own state. The
`spa-accessibility` capability's tab pattern governs this shape. The
studio area's other tab rows already use the same pattern. That set
includes the field catalog's field tabs, the dock tabs, and the
structure/JSON surface toggle. The identity zone's fields carry no
disclosure or tab semantics. They are plain, always-shown form
controls.

Creating the first step in an empty draft SHALL NOT depend on a prior
selection. The palette stays reachable regardless of selection; see
the palette requirement below.

The checks rail's own no-selection presentation carries no "+ Add
step" button. The palette's Step entry is the sole always-reachable way
to add the first step; see the palette requirement below.

#### Scenario: An empty draft with nothing selected shows the checks rail

- **WHEN** a draft with no step selected and no path selected is open
- **THEN** the third column shows the checks rail, not the inspector

#### Scenario: Selecting a step shows its identity zone and behavior tabs

- **WHEN** the developer clicks a step node on the canvas
- **THEN** the inspector shows that step's identity zone and behavior
  tab row, replacing whatever the third column showed before
- **AND** the Assignment tab shows by default

#### Scenario: Selecting a different step resets the shown tab

- **WHEN** the developer has the Timers tab shown for one step and
  clicks a different step node
- **THEN** the inspector shows the new step with its Assignment tab

#### Scenario: Choosing a behavior tab replaces the shown content

- **WHEN** the developer chooses the Assignment, Paths, Actions, Timers,
  or Subprocess tab for the selected step
- **THEN** the inspector shows that tab's content in place of whichever
  tab's content showed before

#### Scenario: Leaving Subprocess moves the shown tab to Assignment

- **WHEN** the developer has the Subprocess tab shown and changes the
  performed-by control away from Subprocess
- **THEN** the Subprocess tab no longer lists, and the Assignment tab
  shows

#### Scenario: The inspector carries the assignment tab

- **WHEN** the developer selects a non-terminal step with no
  `assignment`
- **THEN** the Assignment tab shows, and its editor carries the
  no-assignment warning

#### Scenario: A terminal step suppresses the no-assignment warning

<!-- Why: the linter's sentence splitter merges this WHEN/THEN pair, -->
<!-- since OpenSpec scenario bullets carry no terminal period. -->
<!-- antislop: allow sentence-length -->
- **WHEN** the developer selects a step carrying `terminal: true` and no
  `assignment`, and chooses its Assignment tab
- **THEN** the assignment editor shows with no no-assignment warning

#### Scenario: A terminal step's Paths tab shows an empty state

<!-- Why: the linter's sentence splitter merges this WHEN/THEN pair, -->
<!-- since OpenSpec scenario bullets carry no terminal period. -->
<!-- antislop: allow sentence-length -->
- **WHEN** the developer selects a step carrying `terminal: true` and
  chooses its Paths tab
- **THEN** the tab shows an empty state naming that a terminal step has
  no outgoing paths, and no path editor renders

#### Scenario: The identity zone keeps its translation warnings

- **WHEN** the studio's `contentLocale` is `de`, a step's `label`
  carries the base-locale value but no `de` value, and the developer
  selects that step
- **THEN** the missing-translation warning renders beside that step's
  label input in the identity zone

#### Scenario: The identity zone sets the draft's initial step

- **WHEN** the developer activates the selected step's "set as initial
  step" control in the identity zone
- **THEN** the draft's `workflow.initialStep` names that step's id

#### Scenario: The subprocess tab keeps the cross-process check

- **WHEN** the developer selects a step of type `subprocess` and
  chooses its Subprocess tab
- **THEN** the cross-process check fieldset renders beside the spec
  editor, and its file input still loads a child body

#### Scenario: The step issue count covers an issue on its path

- **WHEN** a step carries no issue of its own and one of its paths
  carries a guard that fails validation
- **THEN** the inspector's diagnostics drawer reports one issue for
  that step

#### Scenario: A behavior tab activates with the keyboard

- **WHEN** a keyboard user tabs to a behavior-zone tab button and
  presses Enter or Space
- **THEN** that tab's content shows, and `aria-selected` reads true on
  that tab alone

#### Scenario: Choosing the view button opens the form editor

- **WHEN** the developer chooses the view button for the selected step
- **THEN** the form editor's routed page opens for that step, and the
  behavior zone's shown tab does not change

#### Scenario: The view button shows a form-status summary

- **WHEN** the developer selects a step carrying a partially configured
  view
- **THEN** the view button shows a status summary of the form and a
  "Build the form" label

#### Scenario: Selecting a path edge shows its source step's Paths tab

- **WHEN** the developer clicks a path edge on the canvas
- **THEN** the inspector shows that edge's source step, with the Paths
  tab shown
- **AND** the clicked path's own row highlights within the paths tab

#### Scenario: Deselecting swaps the column back to the checks rail

- **WHEN** the developer clicks empty canvas space while a step or path
  stays selected
- **THEN** the third column shows the checks rail again, not the
  inspector

#### Scenario: A first step is addable with nothing selected

- **WHEN** an empty draft has no step, and the developer has selected
  nothing
- **THEN** the palette's Step entry stays visible and usable

### Requirement: The step inspector's diagnostics drawer discloses the step's raw data

<!-- Why: "Remove step" below is a literal UI label, not a synonym choice -->
<!-- against "delete" elsewhere in this file. -->
<!-- antislop: allow synonym-rotation -->
The step inspector SHALL carry a diagnostics drawer at the bottom of
the inspector. The drawer SHALL sit visually separate from the
identity and behavior zones. The drawer SHALL hold the selected step's
issue count, a "View raw JSON" toggle, and the existing docked checks
rail. It SHALL also hold the step's "Remove step" control. Expanding
the toggle SHALL show the selected step's raw JSON, read-only.

The "View raw JSON" toggle SHALL be a `<button type="button">`. It
SHALL carry `aria-expanded` for its own state and `aria-controls`
naming the JSON region it discloses, per the `spa-accessibility`
capability's disclosure requirement.

The toggle replaces the former "Developer view" disclosure entry,
which was a peer of the seven content sections. It is distinct from
the path-guard's CEL "Developer view" toggle. The
`studio-condition-builder` capability describes that other toggle.

#### Scenario: The diagnostics drawer's raw-JSON toggle shows the step's JSON

- **WHEN** the developer expands a selected step's "View raw JSON"
  toggle in the diagnostics drawer
- **THEN** the step's raw underlying JSON renders read-only

#### Scenario: Diagnostics drawer offers step removal

- **WHEN** the developer selects a step
- **THEN** the diagnostics drawer shows a "Remove step" control

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

<!-- Why: this block repeats the base spec's wording, which the delta must -->
<!-- match for the archive to apply it. Both findings predate this change. -->
<!-- antislop: allow sentence-length passive-voice -->

Every mutation the canvas can trigger (positioning a step, connecting a
path, inserting a step into a path) SHALL have an existing panel-based
equivalent; the canvas SHALL NOT be
the only way to perform any authoring operation, including deletion, which
SHALL remain panel-only.

The insert gesture holds to this rule by composition. It performs no mutation
the panels lack. The rail's own existing step-creation drag creates the step.
Then `PathsPanel` retargets the source step's existing path to the new step.
It also adds a new path on it, naming the old target. Both are
already-existing panel actions.

The canvas spends one gesture where the panels spend four operations, and
reaches the same draft.

Selection and traversal answer the keyboard directly now. A drag gesture stays
pointer-driven, and the panel route is its keyboard equivalent.

#### Scenario: A step and its paths remain deletable without the canvas

<!-- Why: the scenario repeats the base spec's own wording, character for -->
<!-- character. Both findings predate this change. -->
<!-- antislop: allow passive-voice synonym-rotation -->
- **WHEN** a step or path is deleted through its panel
- **THEN** the deletion succeeds identically to before this change, with no
  canvas-only deletion affordance introduced

#### Scenario: The panels reach an inserted step's end state

<!-- Why: this scenario repeats the base spec's own wording, character for -->
<!-- character. The rail carries that name on the screen. -->
<!-- antislop: allow synonym-rotation -->
- **WHEN** the developer drags a Step from the edit rail onto empty canvas
- **AND** retargets the source step's path to it in `PathsPanel`
- **AND** adds a path on the new step naming the old target
- **THEN** the draft matches what one drop on that path produces
- **AND** it differs in the new step's position and the cleared waypoints

### Requirement: The canvas is keyboard-operable, and traversal follows the paths

The canvas SHALL be one stop in the page's tab order. Entering it SHALL place
focus on the entry point the rule below defines. A roving `tabindex` SHALL
move focus inside it, so no node takes a stop of its own.

Each step node SHALL carry `role="button"`, an `aria-label` and that roving
`tabindex`. A node SHALL drop all three while its inline rename is open. That
rename field is focusable, and ARIA forbids a focusable element inside a
`role="button"`. The `<svg>` SHALL carry `role="application"`, an `aria-label`
naming the graph, and a `tabindex` of its own. The role is load-bearing: a
screen reader's browse mode otherwise consumes an arrow key before the
element's handler sees it.

Arrow keys SHALL move focus. Right SHALL follow an outgoing path. Left SHALL
follow an incoming path. Up and Down SHALL move through the draft's step
order, the order `workflow.steps` holds. Enter SHALL select the focused step
and open its inspector, exactly as a click does. Escape SHALL move focus to
the `<svg>`, which carries the `tabindex` that call needs.

Escape SHALL also move the roving stop itself. The `<svg>` takes
`tabindex="0"`, and every node, path and box drops to `-1`. Tab then leaves
the canvas rather than re-entering it. Re-entering the canvas SHALL land on
that root. An arrow key from a root focus SHALL move to the entry point.

A pointer press SHALL move the roving stop to what it presses. A node press
SHALL take a step focus. A path press SHALL take a path focus, entered through
its source. A disclosure press SHALL take that group's focus.

Without that move an arrow key walks from whatever the keyboard last touched.
Enter binds for a step focus and a path focus alone. A disclosure press
therefore leaves no stop a following Enter also answers.

A key press originating inside the inline rename field SHALL NOT reach the
canvas handler. The exclusion SHALL read the event's target. A target inside a
text-entry field stops the handler. A disclosure button the surface draws is
not such a field. An arrow key and Escape SHALL reach the handler from one.

Focus SHALL alternate between a step and a path. Right from a step SHALL move
to that step's first outgoing path, and Right again to that path's target
step. Left from a step SHALL move to its first incoming path, and Left again
to that path's source step. Right from a path SHALL move to its target step,
whichever end the author arrived through. Left from a path SHALL move to its
source step, on the same rule.

Focus SHALL NOT wrap at a boundary. Right on a terminal step SHALL move
nothing, and Left on the initial step SHALL move nothing. Down on the last
step in the draft order and Up on the first SHALL move nothing. The same holds
at either end of a fan.

The step's `aria-label` SHALL name, in order, its resolved label, its key, its
kind, its stamps and its outgoing-path count. That count SHALL cover the
reachable paths alone. The kind SHALL read step, subprocess or end, the three
words the palette uses. The phrase carrying that count SHALL agree with it in
number. A step carrying one path SHALL NOT announce a plural.

#### Scenario: Tab reaches the canvas and lands on the initial step

- **WHEN** a keyboard author tabs into the canvas
- **THEN** focus lands on the draft's initial step, and the canvas takes one
  stop rather than one per node

#### Scenario: Right walks an outgoing path to its target

- **WHEN** focus sits on a step carrying one outgoing path, and the author
  presses Right twice
- **THEN** focus moves to that path, then to the path's target step

#### Scenario: Left walks an incoming path back to its source

- **WHEN** focus sits on a step carrying one incoming path, and the author
  presses Left twice
- **THEN** focus moves to that path, then to the path's source step

#### Scenario: A step with several outgoing paths reaches each of them

- **WHEN** focus sits on a step carrying three outgoing paths, the author
  presses Right, and then presses Down twice
- **THEN** focus visits the three paths in fan order
- **AND** Right from any of them reaches that path's target

#### Scenario: Up and Down reach a step no path touches

- **WHEN** a draft holds a step with no incoming and no outgoing path
- **THEN** Up and Down still reach it, because they walk the draft's step
  order rather than the graph

#### Scenario: The boundary moves nothing

- **WHEN** focus sits on a terminal step and the author presses Right
- **THEN** focus stays where it is, and no wrap to another step happens

#### Scenario: Enter selects the focused step

- **WHEN** focus sits on a step and the author presses Enter
- **THEN** that step becomes the selection, and the inspector opens on it,
  exactly as a click on the node does

#### Scenario: An arrow key leaves a focused group box

- **WHEN** focus sits on a group box's disclosure button and the author
  presses Down
- **THEN** the canvas handler receives that key, and focus moves on through
  the step order

#### Scenario: A pointer press moves the roving stop

- **WHEN** the author clicks a node other than the focused one, then presses
  Right
- **THEN** focus walks from the clicked node
- **AND** a click on a disclosure moves the stop there, so Enter then toggles
  the group alone

#### Scenario: Escape leaves the canvas, and an arrow key re-enters it

- **WHEN** the author presses Escape on a focused node, then Tab, then
  Shift+Tab, then Right
- **THEN** Escape puts the stop on the `<svg>`, and Tab leaves the canvas
- **AND** Shift+Tab lands on the `<svg>`, and Right moves to the entry point

#### Scenario: A screen reader names a terminal step in full

- **WHEN** focus reaches a terminal step labelled "Approved", keyed
  `approved`, carrying outcome `approved` and no outgoing path
- **THEN** its accessible name carries the label, the key, the kind word,
  the outcome and a zero path count

#### Scenario: A step carrying one path announces the singular

- **WHEN** focus reaches a step carrying exactly one outgoing path
- **THEN** its accessible name reads one outgoing path, never the plural

<!-- antislop: allow synonym-rotation -->
<!-- A total function is mathematics; the path-creation method is code. -->
### Requirement: The traversal is a total function over a deep-partial draft

The traversal reads a `Draft`. `DraftOf` makes that type optional at every
level. Every field the traversal touches MAY therefore be absent while an
author edits. The definition contract's fan invariants hold for a published
`ProcessBody`, validated at publish time. This rule SHALL NOT rest on them,
and SHALL define an outcome for every input below.

A focus SHALL name one of four things: a step, a path, a group, or the `<svg>`
root. The collapsed-group rule returns the third. The entry-point rule returns
the third or the fourth.

A step carrying no `id` SHALL be unreachable. It SHALL hold no place in the
Up/Down order. A path carrying no `id`, and a path carrying no `to`, SHALL
each be unreachable in the same way. The canvas already draws none of the
three as an identified element.

A path whose owning step carries no `id` SHALL be unreachable too. The canvas
draws no path at all for such a step, whatever that path itself carries.

A path SHALL resolve both ends. A path whose `to` names no step in
`workflow.steps` SHALL be unreachable. So SHALL a path whose source and target
sit in one collapsed group. The canvas draws neither.

A group SHALL draw a box only where two of its members resolve to steps the
draft holds. Below that it draws none, hides none of its members, and offers
no entry point. Its members stay drawn and reachable, so the traversal SHALL
NOT read a group's collapsed flag alone.

Fan order SHALL take the step's own `paths` array as its base, filtered to the
reachable paths. One condition SHALL admit `priority` as a refinement. Every
path in the fan carries `trigger: "automatic"`. And every one carries a
`priority` that no sibling in the fan repeats. The fan SHALL then order by
`priority`, ascending.

A fan that fails that condition SHALL keep array order. Three shapes fail it:

- a fan mixing manual and automatic paths
- a fan where one `priority` is absent
- a fan where two paths share one `priority`

A path carrying no `trigger` SHALL keep its array place. Its presence SHALL
put its whole fan into array order. No ordering comparison SHALL read an
absent `priority`.

The entry point SHALL resolve in four steps. It is `workflow.initialStep`
where that names a reachable step. Otherwise the first reachable step in
`workflow.steps` order. Otherwise the first group box the canvas draws.
Otherwise the `<svg>` itself, which SHALL then carry `tabindex="0"` so the
canvas keeps its stop. Where `initialStep` names a step hidden inside a
collapsed group, the entry point SHALL be that group's box.

Where the current focus stops being reachable, the focus SHALL fall back to
that entry point. Collapsing the group around the focused step is one such
case. Deleting the focused step or its path from a panel is another. Some
element inside the canvas SHALL always carry the tab stop.

#### Scenario: A fan missing one priority keeps array order

- **WHEN** a step carries three automatic paths and one of them declares no
  `priority`
- **THEN** the fan walks in the order the step's own `paths` array holds,
  and no comparison reads the absent value

#### Scenario: A fan repeating one priority keeps array order

- **WHEN** two automatic paths on one step declare the same `priority`
- **THEN** the fan walks in the step's own array order

#### Scenario: A mixed fan keeps array order

- **WHEN** a step carries one manual path and one automatic path
- **AND** the contract forbids that fan in a published body, while a draft
  can still hold it
- **THEN** the fan walks in the step's own array order, and the traversal
  raises nothing

#### Scenario: An id-less step and an id-less path are unreachable

- **WHEN** a draft holds a step with no `id`, and another step holds a path
  with no `id`
- **THEN** neither takes focus, and neither holds a place in any order

#### Scenario: A path on an id-less step is unreachable

- **WHEN** a step carrying no `id` holds a path with an `id`, a resolvable
  `to`, and both ends outside any collapsed group
- **THEN** that path takes no focus, because the canvas draws no path for a
  step with no `id`

#### Scenario: A draft with no initial step still enters

- **WHEN** a draft declares no `workflow.initialStep`
- **THEN** the entry point is the first reachable step in `workflow.steps`
  order

#### Scenario: A draft with no reachable step keeps its tab stop

- **WHEN** a draft holds no reachable step and no group
- **THEN** the entry point is the `<svg>`, which carries `tabindex="0"`, so
  the canvas stays in the page's tab order

#### Scenario: Collapsing the group around the focused step keeps the stop

- **WHEN** the focused step disappears, because the author collapsed the group
  holding it or deleted it from a panel
- **THEN** the focus falls back to the entry point, and one element inside the
  canvas still carries `tabindex="0"`

### Requirement: A path is a focusable control carrying its own name

Each path SHALL be a focusable control with `role="button"`, a roving
`tabindex` and an `aria-label`. Activating it SHALL select that path and open
its inspector, exactly as a click on its edge group does.

The guard label's own `<div>` SHALL leave the accessibility tree. A pointer
already reaches the path anywhere along its route. The edge group's own
handler and its full-route hit area do that today. What the surface lacks is a
tab stop, a role and a name. The path itself now carries all three.

The path's `aria-label` SHALL name its label, its source step, its target
step, its trigger and its guard. An automatic path SHALL add its `priority`. A
path carrying no guard SHALL say so.

The guard slot SHALL take the readable condition the canvas draws on the edge,
never the CEL source. That readable form already exists on the surface, under
`aria-hidden`. Where nothing resolves it, the slot SHALL take the source
itself.

While focus sits on a path, Up and Down SHALL walk the fan the author arrived
through. A path entered from its source SHALL walk that source's outgoing
set. A path entered from its target SHALL walk that target's incoming set.

#### Scenario: A keyboard author reaches a path's guard

- **WHEN** a keyboard author moves focus to a path and presses Enter
- **THEN** the inspector opens on that path, and the guard it carries is
  reachable for editing

#### Scenario: An automatic path announces its priority

- **WHEN** focus reaches an automatic path carrying `priority: 10` and a guard
- **THEN** its accessible name carries the label, both step names, the
  trigger word and the guard
- **AND** the priority reads last, after the guard

#### Scenario: A guardless default says it carries no guard

- **WHEN** focus reaches the guardless automatic path at a step's highest
  priority
- **THEN** its accessible name states that it carries no guard

#### Scenario: A guard announces as the phrase the canvas draws

- **WHEN** focus reaches a path guarded by a condition the edge label
  summarizes in words
- **THEN** its accessible name carries that summary, not the CEL source

#### Scenario: The guard label leaves the accessibility tree

- **WHEN** the canvas renders a path carrying a guard
- **THEN** the path itself is focusable and named, and the guard label's
  `<div>` carries `aria-hidden`

### Requirement: A focused canvas element draws a 2px accent ring

The design language fixes the focus indicator at a 2px accent outline, at 2px
offset, on every focusable thing. An SVG element takes no CSS `outline` that
follows its shape, so the canvas SHALL draw the ring as an element.

A step node SHALL carry a ring `<rect>`. It sits three pixels outside the node
on each side. It takes no fill and a 2px accent stroke, painted centered so
the gap reads 2px.

That ring SHALL carry a dash. A selected node draws the same 2px accent, and only
the ring's offset stands between them. That offset scales with the canvas zoom
while the stroke does not. The gap alone therefore cannot separate focus from
selection at every zoom.

A path SHALL carry a halo `<path>` instead. A stroke holds no offset. A line's
indicator is therefore a band around the shape, not a ring at a gap.

That halo sits before the edge and shares the edge's own `d`. It takes no
fill, the accent stroke and a `stroke-width` of 6. It SHALL carry no
`stroke-dasharray`. The 1.5px edge paints over the halo's middle. A manual
path therefore keeps its own dash, and the accent reads on each side.

Each SHALL take `vector-effect="non-scaling-stroke"`, so the canvas zoom does
not scale the width the token states.

CSS SHALL hide each ring by default, and SHALL make it visible under
`:focus-visible` on the element that owns it. The rule SHALL read the state
from that pseudo-class rather than from a class the component sets.

The node and the path SHALL each also set `outline: none`. A bare
`:focus-visible` rule in the shell's tokens gives every focused element a 2px
accent outline. A browser paints that outline on an SVG element as a bounding
box. Exactly one ring SHALL draw on a focused element.

Two focus targets draw no ring element and keep that global outline instead.
The `<svg>` root is one, and a group box's disclosure button is the other. The
button is HTML, so the outline follows its shape already.

#### Scenario: The ring appears on keyboard focus alone

- **WHEN** a keyboard author moves focus to a step node
- **THEN** the node draws a 2px accent ring at 2px offset
- **AND** a pointer click on the same node draws none

#### Scenario: Only the drawn ring appears

- **WHEN** a keyboard author moves focus to a step node
- **THEN** the node draws one ring, not the drawn one beside the shell's
  global `:focus-visible` outline

#### Scenario: The ring keeps its width under zoom

- **WHEN** a focused node is on a canvas zoomed to 200 percent
- **THEN** the ring's stroke still measures 2px on screen

#### Scenario: A focused node reads apart from a selected one

- **WHEN** a keyboard author moves focus to a node that is also selected
- **THEN** the dashed ring reads apart from the node's own solid selection
  stroke, at any canvas zoom

<!-- antislop: allow passive-voice -->
<!-- The MODIFIED header must match the live spec byte for byte. -->
### Requirement: Canvas interaction logic is tested as pure functions, independent of rendering

Twelve computations SHALL live in pure modules with `bun:test` coverage. Five
came first: hit-testing, drag-delta computation, the auto-place traversal, the
connection-validity predicate and the fit-to-view computation.

Two arrived with the selection set. One toggles a step in that set. The other
is the marquee's overlap test against node rectangles. The eighth is the edge
route between two anchors.

The ninth is the anchor rule. It takes a node position and the point that node
faces. It returns that node's anchor and the side it leaves on.

The tenth is the route through a waypoint list. It takes two node positions
and the list. It returns one polyline and the index at which each leg of that
polyline begins.

The eleventh is the group rule set. It gives a group's box, the hidden step
ids, and the box a path anchors on.

The twelfth is the keyboard traversal step. It takes the current focus, a key,
the draft's steps, its groups and its initial step. It reads that last one for
a root focus alone, which resolves to the entry point. The traversal reaches a
path through its owning step. A path lives at `workflow.steps[i].paths`, and no separate
collection holds one.

It returns the next focus, and it is total over a deep-partial draft. `packages/web/src/areas/app/screens/inboxLogic.ts` sets that
convention. The tests need not cover the SVG rendering or the pointer-event
wiring.

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

#### Scenario: The selection toggle and the overlap test hold without rendering

- **WHEN** a test gives the toggle a list of ids and one more id
- **AND** gives the overlap test a rectangle and a list of node positions
- **THEN** each returns its own list of ids, and the test needs no DOM or
  canvas rendering

#### Scenario: The edge route holds without rendering

- **WHEN** a test gives the routing computation a source anchor, a target
  anchor and a style
- **THEN** it returns the route's corner points, and the test needs no DOM or
  canvas rendering

#### Scenario: The anchor rule holds without rendering

- **WHEN** a test gives the anchor rule a node position and a facing point
- **THEN** it returns that node's anchor and the side it leaves on
- **AND** the test needs no DOM or canvas rendering

#### Scenario: The group rules hold without rendering

- **WHEN** a test gives the group rules a list of groups and a list of node
  positions
- **THEN** it returns each group's box, the hidden step ids, and the box a
  given step anchors on
- **AND** the test needs no DOM or canvas rendering

#### Scenario: The waypoint route holds without rendering

- **WHEN** a test gives the waypoint route two node positions and a list of
  points
- **THEN** it returns one polyline through every point in that list
- **AND** it returns the index at which each leg of that polyline begins
- **AND** the test needs no DOM or canvas rendering

#### Scenario: The traversal step holds without rendering

- **WHEN** a test gives the traversal step a focus, a key, a draft's steps, its
  groups and its initial step
- **THEN** it returns the next focus, naming the step, the path, the group or
  the `<svg>` root that takes it
- **AND** the test needs no DOM or canvas rendering

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

The menu SHALL show its remaining controls under one heading: "Process,
saved with the draft". That heading SHALL hold the editable process key
and the base-locale control the `studio-app` capability's base-locale
requirement governs. The menu SHALL NOT offer an action-registry
selector or any other session-only control. Nothing in the studio ever
loads a live `Registry` a registry-resolution check could run against.
The menu therefore holds nothing session-only.

That heading SHALL also hold a "Manage assignment groups for this
process" link. The link SHALL open the admin area's Groups screen: the
`admin-app` capability's `/groups` route.

<!-- antislop: allow synonym-rotation -->
<!-- "parameter" below names a URL query parameter; "option" elsewhere in this file (the "performed by" segmented control) names an unrelated UI choice, not the same concept. -->
It SHALL carry the open process's id as a query parameter. That
parameter pre-filters the Groups screen to global groups plus groups
already scoped to this process.

<!-- antislop: allow synonym-rotation -->
<!-- "surface" below names the UI glossary term (structure surface / JSON surface), not a synonym for "show". -->
The link SHALL appear once a process is open, for any signed-in actor.
It SHALL appear whether or not that actor holds `system:admin`. It SHALL
appear whether the structure surface or the JSON surface is active.

Following it without `system:admin` SHALL lead to one of two outcomes.
The same admin-area-entry gate every other admin route already crosses
decides which (`shell/areas.ts::mayEnter`). An actor may hold
`system:datalists`, or another role `mayEnter` accepts for the admin
area, without holding `system:admin`. That actor SHALL see the admin
area's own `MissingRole` empty state. That is the same state any
`system:admin`-gated route shows a caller without the role.

An actor who holds no admin-area-entry role at all SHALL never reach the
admin area's own code. The shell blocks entry before `AdminArea` mounts,
and shows its generic `area.forbidden` message instead.

The link SHALL carry no group data of its own. It SHALL trigger no
request to a `/admin/groups*` route: it is navigation only, so Studio
duplicates no group CRUD.

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
- **AND** no action-registry selector and no other session-only control
  appears anywhere in the menu

#### Scenario: The menu links to Groups filtered to the open process

- **WHEN** the developer opens the `⋮` menu and selects "Manage
  assignment groups for this process"
- **THEN** the admin area's Groups screen opens, showing global groups plus
  groups already scoped to the open process

#### Scenario: Following the link with admin-area entry but not the admin role

- **WHEN** an actor who holds `system:datalists` but lacks `system:admin`
  follows the link
- **THEN** the admin area shows its own `MissingRole` empty state instead
  of the Groups screen

#### Scenario: Following the link with no admin-area-entry role at all

- **WHEN** an actor who holds neither `system:admin` nor `system:datalists`
  follows the link
- **THEN** the shell blocks entry to the admin area before it mounts
- **AND** it shows the generic `area.forbidden` message instead of the
  Groups screen

#### Scenario: The link renders regardless of the open surface

- **WHEN** the developer has the JSON surface active, not the structure
  surface
- **THEN** the "Manage assignment groups for this process" link still
  appears in the `⋮` menu

### Requirement: The header bar's process key auto-derives from the process label

The header bar's `⋮` menu holds a "Process, saved with the draft" group.
That group's key field SHALL auto-fill from the process label as the
developer types. This holds while the draft's key is empty. It also holds
while the key still matches what derivation would produce from the label's
prior value.

Derivation SHALL read only the process label's base-locale entry. An edit
to any other locale's translation SHALL NOT trigger key derivation.
Derivation SHALL lower-case the label. It SHALL collapse every run of
characters outside `[a-z0-9]` to a single `_`. It SHALL trim a leading or
trailing `_`. A result starting with a digit SHALL gain a leading `_`.

The first edit the developer types directly into the key field SHALL
disable this auto-fill. That holds for the rest of the draft's lifetime in
the browser. No later label edit SHALL overwrite a key the developer has
hand-set. The key field SHALL remain an ordinary editable text input
throughout. Nothing about it SHALL become read-only or disabled otherwise.

#### Scenario: A new process's key follows its label as the developer types

- **WHEN** the developer types "Expense Approval" into a new draft's
  process label, having never touched the key field
- **THEN** the process key reads `expense_approval`

#### Scenario: A hand-edited process key no longer follows the label

- **WHEN** the developer changes the auto-derived process key to `expenses`
  and then edits the process label further
- **THEN** the process key stays `expenses`

#### Scenario: Editing a non-base-locale translation leaves an already-derived process key untouched

- **WHEN** the developer types a base-locale process label, deriving a
  key, then switches the studio's content locale
- **AND** the developer types a translation into the process label's
  non-base-locale entry
- **THEN** the process key stays unchanged

### Requirement: A step node prints the step's label, resolved for the content locale

A step node SHALL print the step's `label`, resolved against the studio's
content locale with fallback to the draft's `baseLocale`. It SHALL fall back
to the step's `key` only when that resolution yields nothing. It SHALL fall
back to the unnamed-step string only when the step also carries no key.

The node SHALL print the key on its own line below the label. Where the label
line already prints the key, the node SHALL omit the key line. One value SHALL
NOT appear on both lines, in any case.

Changing the content locale SHALL change what every node prints, for a step
carrying a translation in the chosen locale.

#### Scenario: A node prints the label, not the key

- **WHEN** the canvas renders a step keyed `capture` and labelled
  `{ en: "Capture the request" }`, with the content locale `en`
- **THEN** the node's first line reads "Capture the request", and its second
  line reads "capture"

#### Scenario: The content locale switch reaches the canvas

- **WHEN** a step's `label` is `{ en: "Review", de: "Prüfen" }` and the author
  switches the content locale to `de`
- **THEN** the node prints "Prüfen"

#### Scenario: A step with no resolvable label falls back to its key

- **WHEN** a step carries key `capture` and a `label` with no entry for the
  content locale and none for the base locale
- **THEN** the node prints the key on its label line
- **AND** the node draws no key line at all, so `capture` appears once

### Requirement: A step node on the canvas offers an inline rename

The canvas SHALL let the developer rename a step's label directly on
its node. Renaming SHALL NOT need editing the step through the
inspector's identity zone. Committing the rename SHALL write
`step.label` through the same Draft mutation the identity zone's label
input already calls.

The field SHALL open seeded with the step's label resolved for the content
locale, and with nothing else. It SHALL NOT seed from the step's `key`, and it
SHALL NOT seed from the unnamed-step string. A step carrying no entry for the
chosen locale therefore opens an empty field. The developer then writes a
translation, rather than committing a copy of the key as a label.

#### Scenario: Double-clicking a node's label opens an inline text field

- **WHEN** the developer double-clicks a step node's label on the canvas
- **THEN** a text field opens on the node, seeded with the step's current
  label

#### Scenario: Committing the inline rename updates the step's label

- **WHEN** the developer edits a node's inline text field and commits it
- **THEN** the step's `label` updates through the same Draft mutation the
  identity zone's label input calls

#### Scenario: A step with no translation opens an empty field

- **WHEN** the content locale is `de`, a step's `label` carries only its
  base-locale entry, and the developer opens the inline rename
- **THEN** the field opens empty, carrying neither the base-locale text nor
  the step's key

#### Scenario: Enter inside the rename field opens no inspector

- **WHEN** the inline rename is open and the developer presses Enter
- **THEN** the rename commits, and the canvas handler neither selects the step
  nor opens the inspector

### Requirement: The identity zone's step key auto-derives from the step label

The identity zone's key field SHALL auto-fill from the selected step's
label as the developer types. This holds for a step whose key is empty. It
also holds for a step whose key still matches what derivation would
produce from the label's prior value. Derivation SHALL follow the same
rule the header bar's process key uses.

This auto-fill and lock behavior SHALL apply through both label-editing
routes. Those routes are the identity zone's own label input, and the
canvas node's inline rename. The two routes are one label-editing surface
for this purpose. A rename through either route SHALL keep the step's key
in agreement with the other. A key locked by a hand-edit made through
either route SHALL stay locked through the other.

The identity zone SHALL append `_2` when the derived key collides with
another step's key in the draft's workflow. If that also collides, the
identity zone SHALL append `_3`. It SHALL keep incrementing the suffix
until the candidate is unique among the draft's steps.

The first edit typed directly into the identity zone's key field SHALL
disable this auto-fill for that step. That holds for the rest of the
draft's lifetime in the browser.

#### Scenario: A new step's key follows its label as the developer types

- **WHEN** the developer, while the studio's content locale is the draft's
  base locale, creates a step from the palette
- **AND** the developer types "Manager review" into its label, having
  never touched its key field
- **THEN** the step's key reads `manager_review`

#### Scenario: A new step's key stays empty while the developer types in a non-base content locale

- **WHEN** the developer has switched the studio's content locale away
  from the draft's base locale
- **AND** the developer creates a step from the palette and types a label
  into it
- **AND** the developer never touches its key field
- **THEN** the step's key stays empty. A newly created step's label seeds
  under the current content locale. Derivation reads only the base-locale
  entry

#### Scenario: A colliding derived step key gets a numeric suffix

- **WHEN** the developer creates a second step and types the same label an
  existing step already carries
- **THEN** the new step's key reads the existing step's derived key with a
  `_2` suffix

#### Scenario: A hand-edited step key no longer follows its label

- **WHEN** the developer changes a step's auto-derived key and then edits
  that step's label further
- **THEN** that step's key stays what the developer typed

#### Scenario: A step renamed via the canvas node's inline rename derives its key the same way

- **WHEN** the developer double-clicks a new step's canvas node
- **AND** the developer types "Manager review" via the inline rename,
  having never touched its key field
- **THEN** the step's key reads `manager_review`. Typing the same label
  into the identity zone would produce the same result

#### Scenario: Editing a non-base-locale translation leaves an already-derived step key untouched

- **WHEN** the developer types a base-locale step label, deriving a key,
  then switches the studio's content locale
- **AND** the developer types a translation into the step label's
  non-base-locale entry
- **AND** the developer does this via either the identity zone or the
  canvas node's inline rename
- **THEN** the step's key stays unchanged

### Requirement: The identity zone's type and terminal controls render as a "performed by" segmented control

The identity zone SHALL render the step's existing `type` and
`terminal` fields as a three-option segmented control, labeled
"performed by". The options are participant (type `task`), subprocess
(type `subprocess`), and nothing/terminal. This SHALL set the same
fields the identity zone's type control sets today; it adds no new
field.

#### Scenario: Choosing a "performed by" option sets the step's type

- **WHEN** the developer selects the subprocess option in a step's
  "performed by" control
- **THEN** the step's `type` becomes `subprocess`, the same field the
  identity zone's type control already sets

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

### Requirement: A subprocess step's node is distinct from a task step's node

The canvas SHALL draw a marker on the node of every step whose `type` is
`subprocess`. It SHALL draw no such marker on a step whose `type` is `task`.
This lets an author see which steps call another process, from the canvas
alone and with no per-step inspection.

The marker SHALL be a second rule inside the node's rectangle, inset from the
outer one. It SHALL carry no corner radius and no fill. It SHALL read the same
colour role the node's outer rule reads. A selected subprocess step keeps the
selection treatment on its outer rule. The marker therefore never hides which
steps the author holds.

The canvas SHALL draw the marker before the node's label, its key, its stamps
and its connect handle. The marker therefore obscures none of them. A
subprocess step that is also initial or terminal SHALL show the marker and
every stamp it earns.

#### Scenario: A subprocess step shows the marker

- **WHEN** a step's `type` is `subprocess`
- **THEN** the canvas draws the inset rule inside that step's node

#### Scenario: A task step shows no marker

- **WHEN** a step's `type` is `task`
- **THEN** the canvas draws that step's node with its outer rule alone

#### Scenario: Changing the step type adds or removes the marker

- **WHEN** the developer switches a selected step's type between `task` and
  `subprocess`
- **THEN** the marker appears on, or leaves, that step's node, with no reload
  and no other node affected

#### Scenario: A subprocess step that is also terminal shows both

- **WHEN** a step's `type` is `subprocess` and the step is terminal
- **THEN** the canvas draws the marker and the outcome stamp, with neither
  one obscured by the other

#### Scenario: A selected subprocess step keeps its selection treatment

- **WHEN** the author selects a subprocess step
- **THEN** the node's outer rule shows the selection treatment every selected
  step shows
- **AND** the marker draws as it does on an unselected step

### Requirement: A canvas node draws no corner radius

Every rect a step node draws SHALL carry `rx="0"`. The design language admits
no exception to the zero-radius rule. An SVG presentation attribute sits
outside the token system's reach. The attribute SHALL therefore state the zero
rather than omit it.

#### Scenario: The node rect is square

- **WHEN** the canvas renders a step node
- **THEN** its rect carries `rx="0"`, matching the subprocess rect inside the
  same node

### Requirement: The identity zone constrains a terminal step's outcome to the process's declared outcomes

When the draft's contract declares one or more `outcomes`, the identity
zone's `outcome` field SHALL offer only those values, not free text.
Without a contract, or with a contract that declares no outcomes, the field
carries no validated meaning. It SHALL stay a free-text field.

#### Scenario: The developer picks an outcome from the declared list

- **WHEN** the developer selects a terminal step on a draft whose contract
  declares one or more outcomes
- **THEN** the identity zone's outcome field offers only those declared
  outcomes as choices

#### Scenario: An outcome field stays free text without a declared outcome list

- **WHEN** the developer selects a terminal step on a draft with no
  contract, or a contract that declares no outcomes
- **THEN** the identity zone's outcome field accepts any text

### Requirement: A step lands on the canvas lattice

The canvas SHALL define one grid step. It SHALL round a step's position to
that lattice on every write it makes.

Four sites write a position, and all four SHALL round:

- The release of a node drag.
- The drop of a step from the edit rail.
- The in-flight drag preview, so the node the author sees under the pointer is
  the node they get on release.
- Activating Arrange, for every step it repositions at once.

Rounding SHALL be nearest. A node therefore moves at most half a step from
where the pointer left it.

A click SHALL stay a click. The existing threshold that separates a click from
a drag runs first. A movement under it SHALL select the step rather than move
it.

Position stays in the opaque `layout` blob. No schema and no hash moves.

#### Scenario: A dragged step lands on the lattice
- **WHEN** an author drags a step and releases it between two lattice points
- **THEN** the stored position is the nearer lattice point on both axes

#### Scenario: The preview shows where the step will land
- **WHEN** an author holds a dragged step between two lattice points
- **THEN** the drawn node already sits on the lattice, and it does not move on
  release

#### Scenario: A dropped step lands on the lattice
- **WHEN** an author drops a step from the edit rail
- **THEN** the stored position sits on the lattice

#### Scenario: A click still selects
- **WHEN** an author presses and releases on a step without passing the
  click threshold
- **THEN** the canvas selects the step, and its position stays where it was

#### Scenario: An arranged step lands on the lattice
- **WHEN** an author activates Arrange
- **THEN** every step's newly stored position sits on the lattice
- **AND** it lands there the same way a drag or a drop already does

### Requirement: The painted grid follows the canvas transform

`.canvas-wrap` SHALL derive its `background-size` from the live canvas scale,
and its `background-position` from the live pan. The canvas SHALL rewrite both
whenever the transform changes.

The lattice and the drawn dots therefore agree at every zoom and every pan. A
node released on a dot lands on that dot. An author reads the snap against the
grid in front of them.

The grid SHALL stay painted on `.canvas-wrap` rather than on the SVG. Panzoom
transforms the SVG, so a grid painted there shrinks with the zoom. It leaves
the rest of the canvas bare. That reason still holds. This requirement makes
the still surface track the moving one, rather than moving the grid onto it.

#### Scenario: The dots track a zoom
- **WHEN** an author zooms the canvas
- **THEN** the drawn dots take their spacing from the scale, and a node sitting
  on a dot stays on it

#### Scenario: The dots track a pan
- **WHEN** an author pans the canvas
- **THEN** the drawn dots move with the graph, and a node sitting on a dot
  stays on it

#### Scenario: A node dropped on a dot lands on it at any zoom
- **WHEN** an author releases a step over a drawn dot at a scale other than 1
- **THEN** the step renders centred on that same dot

### Requirement: Auto layout places steps on the lattice

`ROW_HEIGHT` and `NODE_HEIGHT` SHALL be whole multiples of the grid step, as
`COLUMN_WIDTH` and `NODE_WIDTH` already are.

An auto-placed step SHALL therefore already sit on the lattice. It SHALL NOT
shift when an author first drags it.

A constant off the lattice would move every auto-laid-out step on its first
drag. That reads as the canvas losing the position, rather than correcting
it.

#### Scenario: An auto-placed step does not shift on its first drag
- **WHEN** an author drags an auto-placed step by an exact multiple of the grid
  step
- **THEN** the step moves by exactly that amount, with no extra offset

#### Scenario: Every layout constant sits on the lattice
- **WHEN** the grid step divides the row pitch, the column pitch, the node
  width and the node height
- **THEN** each division leaves no remainder

<!-- Why: "edit rail" is `canvas/EditRail.tsx`'s fixed name
     (`.claude/rules/ui-glossary.md`). The rule reads it as a synonym for
     the "change" this document uses in the OpenSpec sense elsewhere. -->
<!-- antislop: allow synonym-rotation -->

### Requirement: An Arrange control repositions every step from the workflow graph

The canvas toolbar SHALL offer an Arrange control. Activating it SHALL
compute a position for every step in the draft, from the workflow's
steps and paths. It SHALL NOT limit itself to a step with no stored
position, unlike the auto-placed default.

Two steps joined by a path that does not close a cycle SHALL land in
flow order. The step such a path leads to SHALL sit in a later column
than the step the path leaves. That column axis is the one the
auto-placed default already uses. A path that closes a cycle is exempt
from this ordering. Such a path is a rework loop, back to a step the
process already passed through. A cycle makes both directions
impossible to satisfy at once.

An arranged position SHALL already sit on the canvas lattice, whether
or not its path is exempt from flow order.

#### Scenario: Every step receives an explicit position

- **WHEN** an author activates Arrange on a draft with N steps
- **THEN** the saved layout carries an explicit position for all N step
  ids, including a step that already carried one

#### Scenario: A chain of steps arranges in flow order

- **WHEN** three steps form a chain, each joined to the next by one path
- **AND** an author activates Arrange
- **THEN** the second step lands in a later column than the first
- **AND** the third step lands in a later column than the second

#### Scenario: A rework loop is exempt from flow order

- **WHEN** a path leads from a later step back to an earlier one in the
  same cycle
- **AND** an author activates Arrange
- **THEN** both steps still receive a position on the lattice
- **AND** Arrange draws no violation for that one path's own ordering

#### Scenario: An arranged step does not shift on its first drag

- **WHEN** an author drags a step Arrange has just positioned, by an
  exact multiple of the grid step
- **THEN** the step moves by exactly that amount, with no extra offset

### Requirement: A group arranges as one rigid unit

Arrange SHALL treat a group as one node in the workflow graph it
positions. This holds whether the author collapses or expands the
group. Every member of a group SHALL keep its position relative to the
group's other members after an arrange. Only the group's own position
on the canvas SHALL move.

#### Scenario: A collapsed group moves as one box

- **WHEN** an author activates Arrange on a draft holding a collapsed
  group
- **THEN** the group's box appears at a new position on the lattice
- **AND** every member keeps its position relative to the group's other
  members

#### Scenario: An expanded group's members keep their arrangement

- **WHEN** an author activates Arrange on a draft holding an expanded
  group of steps
- **THEN** every member's position changes by the same offset
- **AND** the box drawn around them keeps the size and the internal
  arrangement it had before

### Requirement: Arrange clears the draft's stored waypoints

Activating Arrange SHALL remove every entry from the draft's stored
waypoints. A waypoint anchors to the positions of the two steps its
path joins, and an arrange moves both.

#### Scenario: Arrange clears an existing waypoint

- **WHEN** a path carries a waypoint and an author activates Arrange
- **THEN** the saved layout carries no waypoint for that path afterward

#### Scenario: A waypoint-free draft arranges without changing that

- **WHEN** no path in the draft carries a waypoint and an author
  activates Arrange
- **THEN** the saved layout still carries no waypoints afterward

### Requirement: Arrange confirms before discarding a hand-placed layout

Arrange SHALL ask the author to confirm before it runs. This holds
whenever the draft carries at least one step with an explicit stored
position, or at least one waypoint. A draft with neither SHALL arrange
with no confirmation, since nothing hand-placed is at risk. Whenever
the draft carries at least one waypoint, the confirmation text SHALL
name waypoints among what the arrange will clear.

#### Scenario: A brand-new canvas arranges without a confirmation

- **WHEN** every step in the draft is still at its computed default,
  with no explicit stored position
- **AND** no path in the draft carries a waypoint
- **AND** an author activates Arrange
- **THEN** the layout updates with no confirmation step

#### Scenario: A hand-placed draft confirms before arranging

- **WHEN** at least one step in the draft carries an explicit stored
  position
- **AND** an author activates Arrange
- **THEN** Arrange asks the author to confirm before the layout updates

#### Scenario: A waypoint-only draft confirms before arranging

- **WHEN** no step in the draft carries an explicit stored position,
  but at least one path carries a waypoint
- **AND** an author activates Arrange
- **THEN** Arrange asks the author to confirm before the layout updates

#### Scenario: Declining the confirmation leaves the layout untouched

- **WHEN** the confirmation appears and the author declines it
- **THEN** the draft's stored layout keeps its prior positions

#### Scenario: The confirmation names the waypoints an arrange will clear

- **WHEN** the draft carries at least one waypoint and an author
  activates Arrange
- **THEN** the confirmation text names waypoints among what the arrange
  will clear

### Requirement: The canvas holds a set of selected steps

The canvas selection SHALL be a set of step ids rather than one id. A set of
one step SHALL behave as a single selection behaves today.

A click on a step node SHALL replace the set with that one step. A shift-click
SHALL add that step to the set. A shift-click on a step the set already holds
SHALL drop it. A click on empty canvas SHALL empty the set.

A shift-drag on empty canvas SHALL draw a marquee rectangle. It spans the press
point and the pointer. On release the set SHALL hold every step whose node
rectangle the marquee overlaps. It SHALL hold no other step. An overlap of any
part of a node counts.

The marquee SHALL NOT pan the canvas while it draws. A drag with no shift held
SHALL pan the canvas as it does today.

A click on a path SHALL leave the set holding that path's source step alone.
The canvas SHALL hold one selected path at most.

#### Scenario: Shift-clicking a second node selects both

- **WHEN** the developer clicks one step node, then shift-clicks a second one
- **THEN** the canvas draws both nodes as selected

#### Scenario: Shift-clicking a node already in the set drops it

- **WHEN** the developer has selected two nodes and shift-clicks one of them
- **THEN** the canvas draws that node as unselected, and keeps the other one
  selected

#### Scenario: A plain click replaces the whole set

- **WHEN** the developer has selected three nodes and clicks a fourth one with
  no shift held
- **THEN** the canvas draws the fourth node alone as selected

#### Scenario: A marquee selects every node it touches

- **WHEN** the developer shift-drags a rectangle over empty canvas
- **AND** that rectangle overlaps two of five step nodes
- **THEN** the set holds those two steps and no other
- **AND** the canvas has not panned

#### Scenario: A plain background drag still pans

- **WHEN** the developer drags on empty canvas with no shift held
- **THEN** the canvas pans, and no marquee draws

### Requirement: Dragging a node in the set moves every step in it

A drag on a step node the set holds SHALL move every step in the set. Each one
moves by the same pointer delta.

A drag on a step node the set does not hold SHALL first replace the set with
that one step. It then moves that step alone.

Each moved step SHALL land on the canvas lattice. That is the rounding a single
drag applies today. Each moved step's position SHALL persist as draft layout,
by the route a single drag's position already takes.

The drag preview SHALL draw every moving node at its rounded position. The
group under the pointer is then the group the developer gets on release.

A movement under the click threshold SHALL still count as a click. It SHALL
write no position for any step in the set.

#### Scenario: Dragging one node of a set moves them all

- **WHEN** the developer has selected three steps and drags one of the three
- **THEN** all three move by the same delta, and each lands on the lattice

#### Scenario: Dragging a node outside the set drops the rest

- **WHEN** the developer has selected three steps and drags a fourth one
- **THEN** the fourth step alone moves, and the set then holds it alone

#### Scenario: A click inside a group writes no position

- **WHEN** the developer has selected three steps
- **AND** presses and releases on one of them under the click threshold
- **THEN** no step's layout position changes

### Requirement: A set of several steps offers a count and a delete control

The third column SHALL show the set's count while the set holds more than one
step. It SHALL show a control that deletes every step in the set.

It SHALL NOT show the inspector in that state. The inspector edits one step,
and a set of several names no one step for it.

The delete control SHALL take each step in the set out of the draft's
`workflow.steps`. It SHALL leave a path that points at a deleted step as it is.
The inspector's own delete leaves such a path today, and the checks rail
reports it.

The draft SHALL take the first remaining step as its `workflow.initialStep`
when the deleted set held it. That is the rule a single delete applies today.

The summary SHALL also offer a control that groups the set. Grouping SHALL
create a group holding exactly the selected steps, with a name the author can
change. It SHALL leave the selection as it is.

The control SHALL refuse a set that any group already holds. A step SHALL
belong to at most one group, so nothing has to decide which box draws it.

When the selection exactly matches one group's members, the summary SHALL show
that group's own controls instead. Those are its name, a collapse
control and an ungroup control.

The third column SHALL dock the collapsed checks rail at the summary's bottom
edge. It docks one at the inspector's bottom edge already. The
`studio-checks-rail` capability carries that summary's own rules.

The set SHALL be empty after the delete. The third column then shows the full
checks rail again.

#### Scenario: Two selected steps show a count

- **WHEN** the developer selects two steps
- **THEN** the third column reports a count of two, and shows no step sections
- **AND** the collapsed checks rail docks at that summary's bottom edge

#### Scenario: The delete control deletes every step in the set

- **WHEN** the developer has selected three of five steps
- **AND** activates the delete control
- **THEN** the draft holds the other two steps alone
- **AND** the third column shows the checks rail

#### Scenario: Deleting the initial step moves the marker

- **WHEN** the set holds the draft's initial step and the developer deletes it
- **THEN** the draft's `workflow.initialStep` names the first remaining step

<!-- Why: the header must match the base spec character for character. -->
<!-- antislop: allow passive-voice -->

### Requirement: A path renders as an orthogonal route, under one canvas-wide style

A path SHALL render as an orthogonal route rather than a straight line. Every
segment SHALL lie on one axis.

Each anchor SHALL sit at the midpoint of one side of its own box. That side
is the one the box turns toward the next point on the route. For the source
anchor that point is the first waypoint. Without waypoints it is the target
box's centre. For the target anchor it is the last waypoint, or the source
box's centre.

A box is a step node at the canvas node size. It is also a collapsed group, at
the group box's own size. The anchor rule SHALL read that size rather than
assume a node's. Nothing else about the rule changes.

The larger of the two offsets SHALL pick the axis. A horizontal offset larger
than the vertical one SHALL put the anchor on a left or a right side.
Otherwise it SHALL sit on a top or a bottom side.

A path with no waypoints SHALL therefore draw exactly as it drew before
waypoints existed. Its two anchors read offsets that negate each other
exactly. They land on opposing sides, and both leave on one axis.

A zero offset on the chosen axis SHALL put the anchor on the right
side. Two steps stacked on one position reach that case, and every path SHALL
draw.

An anchor SHALL NOT take a free angle on the node's border. A segment leaving
at an angle has no square turn, and every segment here stays on one axis.

The route SHALL leave each anchor along the axis that anchor sits on.

A path whose source or target sits inside a collapsed group SHALL anchor on
that group's box. It SHALL NOT anchor on the hidden member. A path between two
members of one collapsed group SHALL NOT render at all.

A path MAY carry an ordered list of waypoints. The route SHALL run from the
source anchor to the first waypoint. It SHALL run from each waypoint to the
next, and from the last waypoint to the target anchor. Every waypoint SHALL
lie on the drawn route.

A leg between two points SHALL draw as one straight segment, or as two when
the points share no axis. It SHALL carry no gutter. The gutter clears the node
an anchor sits on, and a waypoint has no box to clear.

The route SHALL NOT double back on itself at any point. Two consecutive
segments on one axis SHALL NOT travel in opposite directions.

The first leg SHALL travel first along its anchor's own axis. The last leg
SHALL arrive along the target anchor's axis. A leg between two waypoints SHALL
travel first along the larger offset between them.

The canvas-wide style SHALL govern every segment of a waypointed route. A path
SHALL NOT carry a style of its own. Switching the toolbar control SHALL
re-route the path between the same waypoints.

The segment count SHALL follow from the two anchors, on both axes. It governs
a path with no waypoints. A waypointed route takes its count from its legs
instead.

A target is ahead when its entry anchor sits beyond the source's exit anchor.
That reading runs along the leaving axis, in the leaving direction. An anchor
pair that is ahead and level on the other axis SHALL take one segment. That is
the common case: the auto-layout places a linear chain of steps on one row. An
anchor pair that is ahead and not level SHALL take three segments.

An anchor pair that is not ahead SHALL take five segments. The route has to
reach the target's entry edge from outside it.

Each turn SHALL sit a whole grid step clear of the node it leaves or enters.
That clearance runs along the axis the anchor leaves on. The turn's
other coordinate follows the anchor, which sits at the node's own middle.

Two styles SHALL ship, and no third. `step` draws square corners.
`smoothstep` draws the same route with rounded ones. There SHALL be no
straight style, and no style that reproduces the pre-change rendering.

The corner radius SHALL clamp to half the shorter of the two segments a corner
joins. A short segment therefore cannot carry an arc that overshoots its own
corner.

The route SHALL carry the pointer over its whole length. The area a developer
clicks SHALL follow the route. It SHALL NOT follow a straight line between the
anchors.

A guard label and a priority badge SHALL sit at the route's own midpoint.

The connect handle SHALL stay at the source node's right-middle, whatever
anchor a path leaving that node takes. The handle is a control an author
presses. A handle that moved under the pointer would be harder to press.

The drag-to-connect preview SHALL stay a straight line from that handle. It
follows the pointer and reaches no target. It has neither a route to draw nor
a side to face.

A selected path SHALL draw one handle at each of its waypoints, and one at the
route's midpoint. An unselected path SHALL draw none. The canvas holds at most
one selected path, so at most one path shows handles.

A handle SHALL draw after the guard label and the priority badge, which read
the same midpoint. A handle stays grabbable that way. It may cover part of a
label, and an author reading a guard deselects the path to clear the handles.

A waypoint handle SHALL draw after the midpoint handle and take the pointer
where the two coincide. A symmetric bend puts the route midpoint on the
waypoint itself, and only the waypoint handle answers a double-click.

Dragging the midpoint handle SHALL add a waypoint at the release point.
Dragging a waypoint handle SHALL move that waypoint. Each SHALL land on the
canvas lattice, the way a dragged step already does.

A new waypoint SHALL take the position in the list that keeps the route's
order. The midpoint handle sits on one leg of the route, and the new waypoint
goes at that leg's own index.

A route segment's index SHALL NOT stand in for a waypoint's index. One leg
draws as one or two segments, so the route carries more segments than the list
carries points.

Double-clicking a waypoint handle SHALL delete that waypoint. A path whose
last waypoint goes SHALL draw the direct route again. That is the whole of
reset, and nothing stores what the route was before.

#### Scenario: A path along one row draws straight

- **WHEN** a step has a path to a step placed to its right on the same row
- **THEN** the path renders as one horizontal segment, and it turns no corner

#### Scenario: A path to a step ahead of it on another row turns two corners

- **WHEN** a step has a path to a step placed to its right and one row down
- **AND** the horizontal gap is the larger of the two
- **THEN** the path renders as three axis-aligned segments, leaving the source
  horizontally and entering the target horizontally

#### Scenario: A path to a step below it leaves the bottom side

- **WHEN** a step has a path to a step placed below it
- **AND** the vertical gap is the larger of the two
- **THEN** the path leaves the source's bottom-middle and enters the target's
  top-middle
- **AND** every segment lies on one axis

#### Scenario: A path to a step above it leaves the top side

- **WHEN** a step has a path to a step placed above it
- **AND** the vertical gap is the larger of the two
- **THEN** the path leaves the source's top-middle and enters the target's
  bottom-middle

#### Scenario: A path to a step behind it on the same row draws straight

- **WHEN** a step has a path to a step placed to its left on the same row
- **AND** the two nodes do not overlap on the horizontal
- **THEN** the path leaves the source's left-middle and enters the target's
  right-middle
- **AND** it renders as one horizontal segment, and it turns no corner

#### Scenario: A path to a step behind it reaches the entry edge from outside

- **WHEN** a step has a path to a step placed to its left and one row down
- **AND** the two nodes overlap on the horizontal
- **THEN** the path renders as five axis-aligned segments
- **AND** it enters the target from outside the target's entry edge

#### Scenario: A straight route carries no arc under either style

- **WHEN** a same-row path renders under `smoothstep`
- **THEN** it draws as one straight segment, with no arc at either end

#### Scenario: The smooth style rounds the same route

- **WHEN** the developer switches the style to `smoothstep`
- **THEN** every path keeps its corner points and draws each corner as an arc

#### Scenario: A short segment does not overshoot its corner

- **WHEN** two steps sit close enough that a route segment is shorter than
  twice the corner radius
- **THEN** the arc clamps to half that segment, and the route stays within its
  own corner points

#### Scenario: A guard label follows the route

- **WHEN** a guarded automatic path renders under either style
- **THEN** its guard label sits at the midpoint of the route
- **AND** it does not sit at the midpoint of a straight line between the
  anchors

#### Scenario: Clicking the route selects the path

- **WHEN** the developer clicks a route where it turns a corner, away from the
  straight line between its anchors
- **THEN** the canvas draws that path as selected

#### Scenario: The connect handle stays put while the anchor moves

- **WHEN** a step's only path leaves its bottom side
- **THEN** that step's connect handle still sits at its right-middle
- **AND** a drag from that handle still previews as a straight line to the
  pointer

#### Scenario: Dragging a step moves its anchors

- **WHEN** the developer drags a target step from the right of its source to
  below it
- **THEN** the path's anchors move to the facing sides, with no reload

#### Scenario: A waypointed route passes through its waypoint

- **WHEN** a path carries one waypoint
- **THEN** the drawn route passes through that point
- **AND** every segment lies on one axis

#### Scenario: A waypointed route never doubles back

- **WHEN** a path carries a waypoint the route reaches head-on
- **THEN** no segment of the route travels back along the one before it
- **AND** no spike stands out of the route at that waypoint

#### Scenario: A waypoint above the two steps turns the route above them

- **WHEN** a path between two steps on one row carries a waypoint above both
- **THEN** the route leaves the source, rises to that waypoint, and comes back
  down into the target

#### Scenario: The source anchor faces the first waypoint

- **WHEN** a path to a step on its right carries a first waypoint above the
  source
- **THEN** the route leaves the source's top side rather than its right side

#### Scenario: The style still governs a waypointed route

- **WHEN** a path carrying waypoints renders under `smoothstep`
- **THEN** every corner of every leg draws as an arc
- **AND** the waypoints do not move

#### Scenario: Only a selected path shows handles

- **WHEN** the developer selects a path
- **THEN** that path draws a handle at each waypoint and one at its midpoint
- **AND** no other path draws a handle

#### Scenario: Dragging the midpoint handle adds a waypoint

- **WHEN** the developer drags a selected path's midpoint handle and releases
- **THEN** the path carries one more waypoint, at the released point rounded
  to the lattice
- **AND** the route passes through it

#### Scenario: Dragging a waypoint handle moves that waypoint

- **WHEN** the developer drags an existing waypoint handle and releases
- **THEN** that waypoint sits at the released point rounded to the lattice
- **AND** the list holds the same number of waypoints as before

#### Scenario: Double-clicking a waypoint handle deletes it

- **WHEN** the developer double-clicks a waypoint handle
- **THEN** the path carries one fewer waypoint

#### Scenario: Deleting the last waypoint restores the direct route

- **WHEN** the developer deletes a path's only waypoint
- **THEN** the path draws the route it drew before any waypoint existed

<!-- Why: the header must match the base spec character for character, or the
     delta adds a requirement rather than modifying one. -->
<!-- antislop: allow passive-voice -->

### Requirement: The canvas edge style persists in the draft layout

One control on the canvas toolbar SHALL switch the style for the whole canvas.
No path SHALL carry a style of its own.

The choice SHALL persist as `layout.canvasEdgeStyle`. That key sits inside the
same opaque `layout` blob the draft round-trips for node positions. There SHALL
be no schema change and no API change.

An absent value SHALL read as `step`. A value this version does not know SHALL
also read as `step`, rather than failing the render.

A path's waypoints SHALL persist as `layout.waypoints[pathId]`, an ordered
list of points. That key sits in the same blob, and it is the second reserved
one.

An absent list SHALL read as no waypoints. So SHALL a value that is not a list
of points, rather than failing the render.

A path the author deletes MAY leave its list behind in `layout`. A step the
author deletes already leaves its position behind, and neither one reaches the
published body.

A draft's groups SHALL persist as `layout.groups`, the third reserved key. It
holds an ordered list. Each entry carries an id, its member step ids, a name
and a collapsed flag.

An absent list SHALL read as no groups. So SHALL a value that is not a list of
groups, rather than failing the render.

A group naming a step the draft no longer holds SHALL drop that member. It
SHALL draw the rest. A group left with fewer than two members SHALL NOT draw.

The reserved keys SHALL NOT collide with a node position. Every step id carries
a `step_` prefix, and the position reader admits only a point.

#### Scenario: The style survives a save and a reload

- **WHEN** the developer switches the style to `smoothstep` and saves the draft
- **AND** opens that draft's canvas again
- **THEN** the canvas draws the smooth style, and the control reports it

#### Scenario: A draft saved before this change renders as step

- **WHEN** a draft whose layout carries no `canvasEdgeStyle` opens
- **THEN** the canvas draws the square style, and the render does not fail

#### Scenario: An unknown style falls back rather than failing

- **WHEN** a draft's layout carries a `canvasEdgeStyle` this version does not
  know
- **THEN** the canvas draws the square style

#### Scenario: The style leaves node positions alone

- **WHEN** the developer switches the style and saves
- **THEN** every step keeps the position it had, and the layout still carries
  one entry per placed step

#### Scenario: Waypoints survive a save and a reload

- **WHEN** the developer bends a path and saves the draft
- **AND** opens that draft's canvas again
- **THEN** the path draws through the same waypoints

#### Scenario: A draft saved before waypoints renders without them

- **WHEN** a draft whose layout carries no `waypoints` opens
- **THEN** every path draws its direct route, and the render does not fail

#### Scenario: A malformed waypoint list falls back rather than failing

- **WHEN** a draft's `layout.waypoints` entry is not a list of points
- **THEN** that path draws its direct route

#### Scenario: Waypoints leave node positions and the style alone

- **WHEN** the developer bends a path and saves
- **THEN** every step keeps its position and the canvas keeps its style

<!-- Why: the header must match the base spec character for character, or the
     delta adds a requirement rather than modifying one. -->
<!-- antislop: allow passive-voice -->

<!-- antislop: allow synonym-rotation -->
<!-- Why: this delta copies four requirement blocks from the base spec
     verbatim, and the base's own established wording uses "render" for what a
     path does and "show" for what the third column does. Changing either verb
     here would fork this file's wording from the spec it modifies. -->

### Requirement: A group gathers steps into one movable, collapsible box

The canvas SHALL draw a box around the members of every group the draft holds.
The box SHALL enclose every member's node, with a margin, and it SHALL carry
the group's name.

A group is an organizational device on the canvas. It SHALL NOT reach
`ProcessBody`. It SHALL NOT change which step an instance holds. It SHALL NOT
introduce parallelism.

The box SHALL draw behind every node, so no member sits under it.

Dragging the box SHALL move every member by the same delta. Each member SHALL
land on the canvas lattice, the rule a multi-step drag already applies. The
box follows its members, so it needs no position of its own.

A group SHALL collapse. A collapsed group SHALL draw one box at the canvas
node size, at its own top-left corner. That box carries the group's name and
its member count. Its members SHALL NOT draw.

Expanding SHALL restore every member at the position it held. A collapse
stores no position, since a member keeps its own entry in `layout` throughout.

Ungrouping SHALL drop the group and leave every member where it is. No step
moves, and no path changes.

Selecting a group's box SHALL select exactly its members. The canvas keeps one
selection concept, so a group needs no selection state of its own.

A marquee SHALL NOT select a hidden member on its own. It SHALL select every
member of a collapsed group whose box it overlaps. That is the rule it applies
to a node it overlaps.

A hidden member SHALL NOT be a connect-drag target. Releasing a connect drag
over a collapsed group's box SHALL behave as a release over any other node.

A path into a collapsed group SHALL keep its waypoints. Its legs re-route
between those waypoints and the box. Expanding restores the route the
waypoints described.

#### Scenario: A group draws a box around its members

- **WHEN** a draft holds a group of three steps
- **THEN** the canvas draws one box enclosing all three nodes, carrying the
  group's name

#### Scenario: The box sits behind its members

- **WHEN** a group's box overlaps its member nodes
- **THEN** every member node draws over the box, and the box hides none of
  them

#### Scenario: Grouping the selection creates a group

- **WHEN** the developer selects three steps and activates the group control
- **THEN** the draft's layout holds a group of exactly those three steps
- **AND** the selection still holds those three steps

#### Scenario: A step belongs to at most one group

- **WHEN** the developer selects a set that any existing group already holds
- **THEN** the group control refuses, and the draft gains no second group

#### Scenario: Dragging the box moves every member

- **WHEN** the developer drags a group's box
- **THEN** every member moves by the same delta, and each lands on the lattice
- **AND** the box encloses them at their new positions

#### Scenario: Collapsing hides the members

- **WHEN** the developer collapses a group
- **THEN** the canvas draws one box at the node size, with the group's name and
  its member count
- **AND** no member node draws

#### Scenario: A path into a collapsed group draws to the box

- **WHEN** a step outside a collapsed group has a path to a member of it
- **THEN** that path draws to the group's box

#### Scenario: A path inside a collapsed group does not draw

- **WHEN** two members of one collapsed group have a path between them
- **THEN** that path does not draw

#### Scenario: Expanding restores every member

- **WHEN** the developer expands a collapsed group
- **THEN** every member draws at the position it held before the collapse

#### Scenario: Ungrouping leaves the steps alone

- **WHEN** the developer ungroups a group
- **THEN** the box goes, every step keeps its position, and every path still
  draws

#### Scenario: A group whose member the draft dropped still draws

- **WHEN** a group names a step the draft no longer holds
- **THEN** the canvas draws the group around its remaining members, and the
  render does not fail

#### Scenario: Selecting the box selects the members

- **WHEN** the developer clicks a group's box
- **THEN** the canvas selects exactly that group's member steps

#### Scenario: A marquee over a collapsed group selects its members

- **WHEN** the developer drags a marquee over a collapsed group's box
- **THEN** the selection holds that group's members
- **AND** it holds no hidden step of any group the marquee missed

#### Scenario: A bent path into a collapsed group keeps its bend

- **WHEN** a path carrying a waypoint enters a group the developer collapses
- **THEN** the route still passes through that waypoint and ends at the box
- **AND** expanding restores the route it drew before

### Requirement: A group box is a disclosure, and traversal skips a hidden member

A group box SHALL carry a real disclosure control. That control is a
`<button type="button">` inside a `<foreignObject>` at the box's bottom-right
corner. The host SHALL measure 28 by 28, at `x + width - 24` and
`y + height - 24`. The button SHALL measure 20 by 20 and sit centered in it,
which puts the button itself at `x + width - 20` and `y + height - 20`.

Those 4 units clear on each side are the focus outline's room. The outline
paints 2px at a 2px offset, outside the button's border box, and a
`<foreignObject>` clips to its own rect. A host cut to the button therefore
draws no indicator at all.

The canvas SHALL draw those hosts last inside the `<svg>`, after every other
pass. No route, node, guard label or waypoint handle then covers one.

The box itself SHALL keep drawing behind every node. Only its disclosure host
draws in the late pass. The group's 20-unit margin keeps that host clear of
every member node.

Enter SHALL toggle the group's collapsed state, through a groups writer the
canvas takes as a prop. The button handles that key itself, so the canvas
handler SHALL leave Enter alone for a group focus. The button SHALL sit in the
canvas's roving `tabindex`. The box SHALL sit in the Up/Down step order
immediately before its first member, collapsed or expanded. A member SHALL
lose its own place in that order only where a collapsed group holds it. A box
holding no place takes no roving stop, and no key then reaches its button.

The button SHALL carry `aria-expanded` reporting the group's collapsed state.
Its accessible name SHALL identify the group by the group's own name.

The canvas SHALL wrap each drawn group's member nodes in a `<g>` carrying a
stable DOM `id`. The button's `aria-controls` SHALL name that `<g>`. That
wrapper SHALL exist in both states. A collapsed group's wrapper holds
nothing, so the attribute never names an absent element.

A press on the button SHALL open the group rather than move it.

The selection toolbar's own collapse control SHALL carry the same
`aria-expanded` and `aria-controls`. It writes the same collapsed flag, so the
two controls SHALL NOT report that state two different ways. That control
SHALL carry `aria-controls` only where the group draws a box. Below two
resolvable members no box draws, and no wrapper `<g>` exists to name.

A step hidden inside a collapsed group SHALL NOT be focusable. Traversal SHALL
skip it. Where a path's far end hides, Right or Left SHALL land on the
collapsed box. That box is the element the path already anchors on.

Right SHALL move from a group box to the first path leaving that box. That is
the first path whose source hides inside it. Left SHALL move to the first path
entering it, on the same rule. A box no such path crosses SHALL keep the
focus. Up and Down SHALL keep the step order they already walk.

A collapsed box stands in for its members, so it stands in for their fan too.
The canvas draws a path between two collapsed groups, names it and gives it a
roving stop. Neither end step is focusable. Without this rule no arrow
sequence reaches that path, and the canvas draws a pointer-only control.

#### Scenario: A collapsed group opens from the keyboard

- **WHEN** focus reaches a collapsed group box and the author presses Enter
- **THEN** the group expands, and its `aria-expanded` reports the new state
- **AND** focus stays on that button, and an arrow key still moves

#### Scenario: An expanded group's disclosure takes the roving stop

- **WHEN** focus sits on the step above an expanded group and the author
  presses Down
- **THEN** focus lands on that group's disclosure button
- **AND** Down again reaches the group's first member

#### Scenario: Traversal lands on the box rather than a hidden step

- **WHEN** focus sits on a step whose outgoing path targets a step hidden
  inside a collapsed group
- **AND** the author presses Right twice
- **THEN** focus lands on the collapsed group box, not on the hidden step

#### Scenario: An arrow key leaves a collapsed box along a crossing path

- **WHEN** focus sits on a collapsed box holding the source of a path leaving
  it
- **AND** the author presses Right
- **THEN** focus lands on that path, entered through its source
- **AND** Left on the box at the far end lands on the same path, entered
  through its target

#### Scenario: A hidden step takes no tab stop

- **WHEN** the author collapses a group
- **THEN** none of its member steps renders a focusable element

#### Scenario: The disclosure is a real button naming what it controls

- **WHEN** the canvas draws a group box
- **THEN** a `<button type="button">` sits in a corner `<foreignObject>` on
  that box, carrying `aria-expanded` and a name identifying the group
- **AND** its `aria-controls` names the `<g>` holding the group's member nodes

#### Scenario: A pointer press on the disclosure moves no group

- **WHEN** the author presses the pointer on a group box's disclosure button
- **THEN** the press reaches the button, and the group starts no drag

#### Scenario: The toolbar's collapse control reports the same state

- **WHEN** a screen reader reaches the selection toolbar's collapse control
- **THEN** it announces the group's expanded state through `aria-expanded`,
  the same attribute the canvas button carries

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

<!-- antislop: allow synonym-rotation -->
<!-- The compile pass's cancel sink is the engine's own term. -->
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
