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
