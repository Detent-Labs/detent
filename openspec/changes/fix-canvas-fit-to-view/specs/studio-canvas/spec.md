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

<!-- The next heading repeats the live spec's requirement name byte for byte.
     Archive matches a MODIFIED requirement on that name, so rewording the
     heading would strand the delta. -->
<!-- antislop: allow passive-voice -->
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
