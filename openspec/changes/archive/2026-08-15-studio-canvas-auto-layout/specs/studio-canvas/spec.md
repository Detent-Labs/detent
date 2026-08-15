## ADDED Requirements

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

## MODIFIED Requirements

<!-- Why: "edit rail" is `canvas/EditRail.tsx`'s fixed name
     (`.claude/rules/ui-glossary.md`). The rule reads it as a synonym for
     the "change" this document uses in the OpenSpec sense elsewhere. -->
<!-- antislop: allow synonym-rotation -->

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
