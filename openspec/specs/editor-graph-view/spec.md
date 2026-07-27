# editor-graph-view

## Purpose

Defines the auto-layouted, read-only FSM graph view: steps as nodes,
paths as edges, driven by the same Draft model and validation issues the
panels use.

## Requirements

### Requirement: Graph view renders the Draft's steps and paths, auto-layouted
The editor SHALL provide a graph view rendering every step in the Draft as
a node and every path as a directed edge, with node positions computed by
an automatic layout algorithm rather than authored by the user.

#### Scenario: New step appears in the graph
- **WHEN** an author adds a step via the steps panel
- **THEN** the graph view shows a corresponding node without the author
  manually placing it

#### Scenario: New path appears as an edge
- **WHEN** an author adds a path from one step to another
- **THEN** the graph view shows a directed edge between the corresponding
  nodes

### Requirement: Graph view is read-only in v1
The graph view SHALL NOT support creating, moving, or deleting entities by
direct manipulation (drag-to-connect, drag-to-reposition, in-canvas
delete). All structural edits SHALL happen through the panels; the graph
view only reflects Draft state.

#### Scenario: Dragging a node does not persist a position
- **WHEN** an author drags a node in the graph view
- **THEN** either the interaction is disabled, or any resulting visual
  move is not written back to the Draft and is undone on the next
  re-layout

#### Scenario: No connect-by-drag affordance exists
- **WHEN** an author hovers or drags from one node toward another in the
  graph view
- **THEN** no new path is created as a result

### Requirement: Graph view reflects validation issues
Nodes and edges SHALL display the validation issues attached to the
entities they represent, sourced from the same issue list the panels use.

#### Scenario: A step with a validation issue is visually flagged
- **WHEN** a step has one or more `EditorIssue` entries
- **THEN** the graph view's corresponding node displays an indicator that
  it has issues

#### Scenario: Issue list matches between panel and graph
- **WHEN** a path has a CEL guard issue
- **THEN** the issue shown on the graph edge and the issue shown on the
  paths panel are the same `EditorIssue` entry, not independently derived

### Requirement: Graph node labels prefer the step's key; locale resolution is a fallback only

A step node's displayed label SHALL be its `key` whenever `key` is
non-empty; only when `key` is empty SHALL the label fall back to resolving
`LocalizedText` `label` (via `resolveLocalizedText`, content locale with
`baseLocale` fallback), and SHALL fall back further to a fixed placeholder
when neither yields text. Since every step created through the normal
authoring flow has a non-empty `key`, this means: in practice, switching the
content locale does NOT change a node's displayed label for any real Draft —
the locale-resolved path is live code, but effectively unreachable outside a
deliberately keyless step. This was previously documented as if
content-locale switching always drove the node label; it does not.

#### Scenario: A step with a key displays that key regardless of content locale
- **WHEN** a step has a non-empty `key` and a `LocalizedText` `label`
- **THEN** the graph view's corresponding node displays the `key`, and
  switching the content locale does not change it

#### Scenario: A keyless step falls back to its resolved label
- **WHEN** a step's `key` is empty and its `label` is
  `{ en: "Review", de: "Prüfen" }` with the current content locale `de`
- **THEN** the graph view's corresponding node displays `"Prüfen"`

#### Scenario: A keyless step with no label falls back to a placeholder
- **WHEN** a step's `key` is empty and it has no resolvable `label`
- **THEN** the graph view's corresponding node displays `"(unnamed step)"`

### Requirement: Graph edges route directly, without looping via the opposite side

Edges SHALL render as short, direct connections between steps laid out by
the graph's horizontal auto-layout — leaving a source step from its
trailing side and entering a target step from its leading side — rather
than as a free-form curve that loops via the opposite side of either node.
This is achieved through Mermaid's `flowchart LR` auto-routing (the graph
view renders via Mermaid, not React-Flow — there are no fixed per-node
"handle" positions to route between); the functional outcome (direct
source-right-to-target-left edges) is what this requirement constrains, not
a specific rendering mechanism.

#### Scenario: A forward edge is direct, not a loop
- **WHEN** the graph view renders an edge between two steps laid out
  left-to-right (e.g. `capture -> review`)
- **THEN** the edge leaves the source node's right side and enters the
  target node's left side, without an unnecessary wide loop

### Requirement: Graph edges display a directional arrowhead
Every edge in the graph view SHALL display a visually rendered arrowhead
marker at its target end — the marker SHALL paint with a non-transparent
fill or stroke, not merely exist as a `marker-end` reference in the
underlying SVG — so the direction of an edge is visually unambiguous even
when a counter-edge exists between the same two nodes.

#### Scenario: Two edges between the same pair of steps are distinguishable
- **WHEN** two paths exist between the same two steps in opposite
  directions (e.g. an automatic guard path from step A to step B, and a
  manual path from step B back to step A)
- **THEN** each edge displays an arrowhead at its target end, making the
  direction of each edge identifiable independent of the other

#### Scenario: A non-issue edge's arrowhead is visible
- **WHEN** the graph view renders an edge with no attached validation issue
- **THEN** the edge's arrowhead marker paints with the graph's default edge
  color, not a transparent fill and stroke

### Requirement: Graph view fits the viewport once layout has resolved
The graph view SHALL fit its content to the visible viewport after the
automatic layout has produced positions for the current graph structure,
rather than at initial mount. It SHALL NOT re-fit on every subsequent
structural change (so a user's zoom/pan is preserved across ordinary edits),
but SHALL fit again whenever a different process is loaded or imported into
the session.

#### Scenario: First load fits the whole graph
- **WHEN** the graph view first renders a process and the automatic layout
  has finished computing positions for it
- **THEN** the view zooms/pans so the entire graph is visible, without
  requiring the author to manually zoom out

#### Scenario: A structural edit does not trigger a refit
- **WHEN** an author adds a step or path after the graph has already been
  fit once
- **THEN** the view's current zoom and pan are preserved; no automatic
  refit occurs

#### Scenario: Loading a different process triggers a refit
- **WHEN** an author loads or imports a different process into an
  already-open editor session
- **THEN** the graph view fits the newly loaded process's graph to the
  viewport, the same as on first load

#### Scenario: Reloading the same process still triggers a refit
- **WHEN** an author loads or imports the same process that is already open
  in the session (its steps and paths are structurally unchanged)
- **THEN** the graph view still fits the graph to the viewport, the same as
  on first load, rather than silently keeping whatever zoom/pan was
  previously in effect

#### Scenario: A non-structural redraw preserves the viewport
- **WHEN** an author switches the content locale (or triggers any other
  Draft change that causes the graph to redraw without changing which
  steps or paths exist)
- **THEN** the view's current zoom and pan are preserved, the same as for a
  structural edit — even though the underlying rendering re-generates its
  visual output from scratch rather than incrementally updating it
