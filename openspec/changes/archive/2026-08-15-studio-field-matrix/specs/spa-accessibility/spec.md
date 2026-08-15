## ADDED Requirements

### Requirement: A two-dimensional data grid uses roving-tabindex grid semantics

A two-dimensional grid of data cells has rows and columns that both
carry meaning, unlike a single-axis list or table. Where a package
renders one, the grid SHALL carry `role="grid"`. The grid as a whole
SHALL be one stop in the page's tab order. Each cell SHALL NOT take its
own stop. Arrow keys SHALL move focus one cell at a time within the
grid, in the direction pressed.

Each column header cell SHALL carry `<th scope="col">`. Each row header
cell SHALL carry `scope="row"`. Together these let a screen reader
announce a cell's row and column identity, alongside its content.

Where the grid scrolls independently of the page, its scrolling region
SHALL carry `tabindex="0"` and an accessible name. A keyboard user can
then reach and scroll it, without first tabbing to a cell inside it.

This governs the `studio-app` capability's field matrix, the one grid
of this shape in the browser packages today. A future grid of the same
shape SHALL follow the same pattern rather than inventing a second one.

#### Scenario: The grid is one tab stop

- **WHEN** a keyboard user tabs toward the grid
- **THEN** focus lands on the grid once, not once per cell

#### Scenario: Arrow keys move within the grid

- **WHEN** a keyboard user presses an arrow key while focus is inside
  the grid
- **THEN** focus moves to the adjacent cell in that direction
- **AND** the grid remains the page's one tab stop for it

#### Scenario: A screen reader announces a cell's row and column together

- **WHEN** focus reaches a data cell
- **THEN** the announcement includes both the cell's row header and its
  column header, alongside the cell's own content

#### Scenario: The scroll region is reachable without a cell first

- **WHEN** a keyboard user tabs to the grid's scrolling region directly
- **THEN** it is focusable, carries an accessible name, and scrolls with
  the keyboard
