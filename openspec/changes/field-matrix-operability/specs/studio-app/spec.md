## ADDED Requirements

### Requirement: A bulk flag badge reads all three of its states

A bulk flag badge SHALL show which of three states its eligible cells hold.
Every eligible cell carries the flag's non-default value, none does, or some
do. The three SHALL look different from one another.

A badge whose cells disagree SHALL NOT look like a badge whose cells all hold
the default. Those two states send an author opposite information. A press on
the first destroys work. A press on the second destroys nothing.

The mixed look SHALL follow the flag's own color, the way the pressed look
does. The fill SHALL carry the difference between them. An author then reads
state and flag from one mark.

Text on a badge SHALL meet the contrast floor against whatever ground that
badge's state gives it. A state carrying no fill therefore takes its own text
color.

#### Scenario: A column where some cells carry the flag reads as mixed

- **WHEN** a column holds four eligible cells and two carry `required: true`
- **THEN** its `required` badge shows the mixed state
- **AND** that state differs from the state the same badge shows when no cell
  carries `required`

#### Scenario: A column where every cell carries the flag reads as full

- **WHEN** every eligible cell in a column carries `required: true`
- **THEN** its `required` badge shows the full state

#### Scenario: The mixed state survives both color schemes

- **WHEN** a badge shows the mixed state, in either color scheme
- **THEN** it stays distinguishable from the empty state and from the full
  state

### Requirement: A bulk flag badge names the cells its press will touch

A bulk flag badge SHALL state how many cells its press writes. It SHALL also
state how many already hold the value that press would set. Both numbers
SHALL reach a pointer user through the badge's title. Both SHALL reach a
screen reader user through its accessible name.

An author SHALL be able to read the blast radius without pressing. The studio
has no undo for a bulk write. The count stands in place of one.

#### Scenario: A mixed badge states both numbers

- **WHEN** the author points at a `required` badge over four eligible cells,
  two of which already carry `required`
- **THEN** the badge states that a press writes four cells and that two
  already hold the value

#### Scenario: The count reaches a screen reader

- **WHEN** focus reaches that badge
- **THEN** its accessible name carries the same two numbers its title carries

### Requirement: A bulk flag badge names the column or row it acts on

A bulk flag badge's accessible name SHALL identify the column or the row it
writes. A grid of thirty badges SHALL NOT give them three names between them.

The name SHALL carry the flag and the target together. A screen reader user
moving across a header row then hears the step each badge belongs to.

#### Scenario: Two badges for one flag carry different names

- **WHEN** a screen reader user reaches the `required` badge on two different
  step columns
- **THEN** each name identifies its own step
- **AND** the two names differ

### Requirement: The field matrix states an empty result in words

The field matrix SHALL say so in words where it has no row to draw. It SHALL
NOT draw a table that carries headers above no row.

Two routes reach this state. A process declares no field, or a filter leaves
no row. The words SHALL say which route applies. One is a process to fix. The
other is a filter to clear.

#### Scenario: A process with no field says so

- **WHEN** the author opens the Field matrix tab on a process that declares no
  field
- **THEN** the tab states in words that the process declares no field
- **AND** it draws no header-only table

#### Scenario: A filter that hides every column says so

- **WHEN** the author engages Hide-inert on a process whose every step is
  inert
- **THEN** the tab states in words that the filter leaves nothing to show

### Requirement: The Hide-inert toggle shows its pressed state

The Hide-inert toggle SHALL look different when engaged. It carries
`aria-pressed` today, and nothing paints that state.

Code SHALL pick a named compiled style from the same value it passes to
`aria-pressed`. No stylesheet SHALL select on the attribute.

#### Scenario: The engaged toggle differs from the resting one

- **WHEN** the author engages Hide-inert
- **THEN** the control's appearance differs from its resting appearance
- **AND** its `aria-pressed` value reads `true`

### Requirement: A gated cell gives its reason

A cell the studio gates for a flag SHALL say why. It carries `aria-disabled`
today and answers a click with nothing.

The reason SHALL reach a pointer user through the cell's title, and a screen
reader user through its accessible description. The two gating cases carry
different reasons, and the wording SHALL say which one applies.

#### Scenario: A cell gated by its own visible flag says so

- **WHEN** the author points at a `required` checkbox on a cell whose
  `visible` resolves to `false`
- **THEN** the cell states that the flag needs a visible cell

#### Scenario: A cell gated as a technical field says so

- **WHEN** the author points at a `required` checkbox on a technical field's
  cell
- **THEN** the cell states that the definition contract rejects the flag there
