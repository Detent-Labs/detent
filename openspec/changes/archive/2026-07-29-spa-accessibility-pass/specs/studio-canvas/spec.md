## ADDED Requirements

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
