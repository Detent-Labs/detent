## ADDED Requirements

### Requirement: A step lands on the canvas lattice

The canvas SHALL define one grid step. It SHALL round a step's position to
that lattice on every write it makes.

Three sites write a position, and all three SHALL round:

- The release of a node drag.
- The drop of a step from the edit rail.
- The in-flight drag preview, so the node the author sees under the pointer is
  the node they get on release.

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
