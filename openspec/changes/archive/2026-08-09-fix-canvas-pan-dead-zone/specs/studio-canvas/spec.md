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
what a step draws beside its rectangle. That includes the start arrow left of
the initial step and the terminal stamp above a terminal step. It SHALL also
keep the framed content clear of any control the canvas overlays on itself,
such as the toolbar.

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
- **THEN** no step, start arrow or terminal stamp comes to rest under the
  toolbar

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

<!-- antislop: allow synonym-rotation -->
<!-- "surface" and "render" both come from the existing spec's own wording
     (the requirement header and its scenarios), copied verbatim per the
     MODIFIED-requirement workflow so archiving can match it against the
     live spec. -->
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
