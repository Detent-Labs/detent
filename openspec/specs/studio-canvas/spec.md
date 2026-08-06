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

### Requirement: Paths are created by dragging from a source step to a target step

The canvas SHALL offer a connect handle on each step node; dragging from a
handle and releasing over another step SHALL create a path from the source to
the target through the same path-creation method `PathsPanel`'s own "add
path" action already calls, defaulting to that step's existing trigger type
(manual or automatic) when one is already set. Releasing outside any step
SHALL cancel the connection and create nothing.

#### Scenario: A completed drag creates a path

- **WHEN** a connect-handle drag starts on step A and is released over step B
- **THEN** a path from A to B exists in the Draft model, creatable through
  the same call `PathsPanel` uses

#### Scenario: A cancelled drag creates nothing

- **WHEN** a connect-handle drag is released over empty canvas
- **THEN** no path is added to the Draft model

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

### Requirement: Selecting a node or edge expands its detail in a permanent inspector beside the canvas

`StepsPanel` SHALL mount as a fixed-width inspector column beside the
canvas at all times. Its own list and "+ Add step" action stay
reachable whether or not the developer has selected anything. Creating
the first step never depends on a prior selection.

Selecting a step node on the canvas SHALL show that step's sections in
a compact index. Each entry carries its own entity count. The sections
are identity (key, label, description, type, terminal, outcome),
assignment, paths, timers, actions, subprocess spec, and view.

The index SHALL carry every section the step card body holds today. It
SHALL NOT drop the assignment section. `studio-app` requires a
no-assignment warning beside the assignment editor. That requirement
has no anchor without the section.

The identity section SHALL keep the missing-translation warning beside
the step's label input and beside its description input. Those are two
of the six `LocalizedTextInput` sites `studio-app` requires a warning
at.

The subprocess spec section SHALL keep the cross-process check fieldset
beside the spec editor. That fieldset holds the file input which loads a
child body, and `checkSubprocessChildRefs` runs against nothing without
it. Dropping the fieldset would remove the only route to that check.

Selecting a path edge SHALL resolve to its *source* step and show that
step's index the same way. A path is not independently addressable. It
only exists nested under its step.

Choosing any section other than view SHALL scroll to and expand that one
section beneath the canvas. Every other section stays collapsed. `StepsPanel`
already nests `PathsPanel` under the paths section. Deselecting SHALL
collapse any expanded section, leaving the index visible. No panel's
own fields, validation, or mutation logic SHALL change. Only how an
author reaches each section changes.

Choosing the view entry SHALL instead open the form editor (see the
`studio-form-editor` capability). A step's form benefits from a canvas
of its own, not an inline scroll target. This is the one section entry
that opens a dialog instead of scrolling. `StepsPanel` SHALL hold no
inline view section beneath the canvas. The index then carries one
route to a step's view, not two.

A section entry is a disclosure. It SHALL therefore be a
`<button type="button">`. It SHALL carry `aria-expanded` for its own
state, and `aria-controls` naming the section it opens. The
`spa-accessibility` capability requires that shape of every disclosure.

The view entry opens a dialog rather than a section. It SHALL instead
carry `aria-haspopup="dialog"` and no `aria-controls`. A disclosure's
`aria-expanded` describes a region the document already holds. A modal
dialog is not that region.

#### Scenario: Selecting a step shows its section index

- **WHEN** the developer clicks a step node on the canvas
- **THEN** `StepsPanel` shows that step's sections with their entity
  counts in the inspector column

#### Scenario: Choosing a non-view section expands it beneath the canvas

- **WHEN** the developer chooses the identity, assignment, paths,
  timers, actions, or subprocess spec entry for the selected step
- **THEN** `StepsPanel` scrolls to and expands that section, and every
  other section stays collapsed

#### Scenario: The index carries the assignment section

- **WHEN** the developer selects a non-terminal step carrying no
  `assignment`
- **THEN** the index lists an assignment section, and choosing it
  expands the assignment editor with its no-assignment warning beside
  it

#### Scenario: The identity section keeps its translation warnings

- **WHEN** the studio's `contentLocale` is `de`, a step's `label`
  carries the base-locale value but no `de` value, and the developer
  chooses the identity section
- **THEN** the missing-translation warning renders beside that step's
  label input

#### Scenario: The subprocess spec section keeps the cross-process check

- **WHEN** the developer selects a step of type `subprocess` and chooses
  the subprocess spec section
- **THEN** the cross-process check fieldset renders beside the spec
  editor, and its file input still loads a child body

#### Scenario: The step issue count covers an issue on its path

- **WHEN** a step carries no issue of its own and one of its paths
  carries a guard that fails validation
- **THEN** the section index reports one issue for that step

#### Scenario: A section entry expands with the keyboard

- **WHEN** a keyboard user tabs to a non-view section entry and presses
  Enter or Space
- **THEN** the section expands, `aria-expanded` reads true, and pressing
  again collapses it

#### Scenario: Choosing the view entry opens the form editor

- **WHEN** the developer chooses the view entry for the selected step
- **THEN** the form editor dialog opens for that step, and no section
  expands inline beneath the canvas

#### Scenario: Selecting a path edge shows its source step's index

- **WHEN** the developer clicks a path edge on the canvas
- **THEN** `StepsPanel` shows the section index for that edge's source
  step

#### Scenario: Deselecting collapses the expanded section, not the index

- **WHEN** the developer clicks empty canvas space while a section is
  open
- **THEN** the section collapses, no entity stays selected, and
  `StepsPanel`'s list (including "+ Add step") remains visible

#### Scenario: A step is addable with nothing selected

- **WHEN** the developer has selected no step or edge
- **THEN** `StepsPanel`'s "+ Add step" action stays visible and usable
  in the inspector column
### Requirement: The canvas supports pan and zoom over the process graph

The canvas SHALL support panning by dragging empty canvas space and zooming
via scroll/wheel input, and SHALL offer a "fit to view" control that frames
every step. This SHALL reuse `@panzoom/panzoom`, the same library
`packages/editor`'s read-only graph view used for the same purpose before
`packages/editor` was deleted.

#### Scenario: Fit to view frames all steps

- **WHEN** "fit to view" is activated
- **THEN** every step in the current draft is within the visible canvas area

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

Following the existing convention (`packages/web/src/areas/app/screens/inboxLogic.ts`),
hit-testing, drag-delta computation, the auto-place traversal, and the
connection-validity predicate SHALL live in pure modules with `bun:test`
coverage. The SVG/React rendering and pointer-event wiring itself is not
required to be tested.

#### Scenario: Connection validity is tested without rendering

- **WHEN** the connection-validity predicate is given a step's existing
  paths and a candidate path
- **THEN** it returns accept or reject-with-reason, and the test needs no
  DOM or canvas rendering

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

