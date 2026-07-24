## MODIFIED Requirements

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

### Requirement: Graph edges route directly via fixed handle positions
Edges SHALL render as short, direct connections between steps laid out by
the graph's horizontal auto-layout — leaving a source step from its
trailing side and entering a target step from its leading side — rather
than as a free-form curve that loops via the opposite side of either node.

#### Scenario: A forward edge is direct, not a loop
- **WHEN** the graph view renders an edge between two steps laid out
  left-to-right (e.g. `capture -> review`)
- **THEN** the edge leaves the source node's right side and enters the
  target node's left side, without an unnecessary wide loop
