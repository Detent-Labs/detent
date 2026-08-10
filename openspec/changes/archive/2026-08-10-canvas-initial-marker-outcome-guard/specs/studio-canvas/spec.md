## MODIFIED Requirements

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

## ADDED Requirements

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
