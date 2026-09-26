# Spec Delta

## ADDED Requirements

### Requirement: A scroll box leaves room for the focus ring

A scroll box clips at its padding edge on both axes. A focus ring that falls
outside that edge loses the part that falls outside. Each scroll box in the
studio area SHALL therefore keep a gap inside its padding edge. No control
inside the box SHALL sit in that gap.
That gap SHALL at least equal the ring's reach, the ring's width plus its
offset. The ring SHALL then stay whole on every side at every scroll
position.

Shared tokens SHALL carry the ring's width and offset, and a third token
their sum. The global `:focus-visible` ring SHALL read the width and offset
tokens. Every scroll box SHALL read the sum. The gap then follows the ring
when the ring changes.

A control whose ring draws inside its own box does not need the gap. A grid cell's
inset ring is of that kind.

#### Scenario: A focused step at the rail's edge keeps its whole ring

- **WHEN** keyboard focus lands on the first step in the steps rail
- **THEN** the ring's top, left and right edges all lie inside the rail's
  visible box

#### Scenario: A focused tab in the tab row keeps its whole ring

- **WHEN** keyboard focus lands on a tab in the process tab row at a 400px
  wide viewport
- **THEN** the ring's top and bottom edges both lie inside the row's visible
  box

#### Scenario: A command at the tab body's edge keeps its whole ring

- **WHEN** keyboard focus lands on the Changes tab's Expand all command
- **THEN** the ring's right edge lies inside the tab body's visible box

#### Scenario: The ring and the gap follow the same tokens

- **WHEN** the ring's width or offset token changes value
- **THEN** the global ring and the gap in every scroll box both follow it,
  and no ring clips
