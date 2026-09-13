## MODIFIED Requirements

### Requirement: The field matrix takes the height the tab body leaves

The field matrix's grid SHALL grow with its rows. It SHALL stop at the height
the tab body leaves under the matrix toolbar. This requirement calls that
height the height under the toolbar. That stop SHALL never fall below a floor
of 24rem.

Past the stop the grid SHALL scroll inside itself. The grid SHALL have no fixed
maximum height. A taller window therefore shows more rows, and no empty band
sits below the grid.

On a window with room for everything above the grid and for the floor, the tab
body SHALL NOT scroll. That room counts the toolbar and the spacing between the
toolbar and the grid. On a shorter window the stop sits at the floor and the
tab body scrolls. A grid whose rows need more than the floor then measures the
floor.

A grid SHALL end under its last row when its rows need less than the height
under the toolbar. That holds for a grid shorter than the floor too. The grid's
frame SHALL have no empty band under its last row.

The toolbar SHALL keep its own height at every window height. The grid gives up
height first, down to the floor.

#### Scenario: A long matrix reaches the bottom edge

- **WHEN** the Field matrix tab opens on a draft whose grid is taller than the
  height under the toolbar
- **THEN** the grid's bottom edge is the tab body's bottom edge
- **AND** no empty band sits below the grid
- **AND** the tab body itself does not scroll

#### Scenario: The grid scrolls inside itself with its headers in place

- **WHEN** the author scrolls that grid down and sideways
- **THEN** the grid's rows move inside its own frame
- **AND** the step header row and the field header column keep their place
- **AND** the toolbar keeps its place above the grid

#### Scenario: A taller window shows more rows

- **WHEN** the author makes the window taller with the Field matrix tab open
- **THEN** the grid grows with the window and shows more rows

#### Scenario: A short matrix ends under its last row

- **WHEN** the Field matrix tab opens on a grid whose rows need less than the
  height under the toolbar
- **THEN** the grid's frame ends under its last row
- **AND** the grid shows no vertical scrollbar

#### Scenario: A matrix shorter than the floor has no empty band

- **WHEN** the Field matrix tab opens on a grid whose rows need less than 24rem
- **THEN** the grid's frame ends under its last row
- **AND** no empty band sits inside the frame

#### Scenario: A short window holds the floor

- **WHEN** the Field matrix tab opens on a window too short for everything
  above the grid and the floor
- **THEN** a grid whose rows need more than 24rem measures 24rem
- **AND** the toolbar keeps its own height
- **AND** the tab body scrolls to reach the rest of the grid
