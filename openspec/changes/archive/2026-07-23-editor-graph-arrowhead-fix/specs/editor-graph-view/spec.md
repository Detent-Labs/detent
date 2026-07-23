## MODIFIED Requirements

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
