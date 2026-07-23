## ADDED Requirements

### Requirement: Graph edges route directly via fixed handle positions
Nodes SHALL expose a target handle on the left side and a source handle on
the right side, matching the graph's horizontal auto-layout direction. Edges
SHALL use a right-angle-segment style rather than a free-form curve, so a
forward edge between two steps renders as a short, direct connection instead
of leaving and re-entering a node from the same side.

#### Scenario: A forward edge is direct, not a loop
- **WHEN** the graph view renders an edge between two steps laid out
  left-to-right (e.g. `capture -> review`)
- **THEN** the edge leaves the source node's right side and enters the
  target node's left side, without an unnecessary wide loop

### Requirement: Graph edges display a directional arrowhead
Every edge in the graph view SHALL display an arrowhead marker at its target
end, so the direction of an edge is visually unambiguous even when a
counter-edge exists between the same two nodes.

#### Scenario: Two edges between the same pair of steps are distinguishable
- **WHEN** two paths exist between the same two steps in opposite
  directions (e.g. an automatic guard path from step A to step B, and a
  manual path from step B back to step A)
- **THEN** each edge displays an arrowhead at its target end, making the
  direction of each edge identifiable independent of the other

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
