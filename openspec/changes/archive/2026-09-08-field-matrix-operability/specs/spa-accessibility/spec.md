## ADDED Requirements

### Requirement: A control inside a grid cell joins the grid's roving model

A grid is one stop in the page's tab order. A control a grid renders inside
one of its cells SHALL NOT take a stop of its own. It SHALL carry
`tabindex="-1"`. The arrow keys that move focus through the grid SHALL reach
it.

A header cell counts as a cell here. A bulk-action control in a header row
sits inside the grid. It follows the grid's own model. The page's tab order
skips it.

This closes a gap the roving-tabindex requirement leaves open. That
requirement says a cell takes no stop of its own. It says nothing about a
button a cell contains. The field matrix put thirty of those in the tab
order.

#### Scenario: A header control takes no tab stop of its own

- **WHEN** a keyboard user tabs through a page holding a grid whose header
  cells carry action controls
- **THEN** focus lands on the grid once
- **AND** it does not land on any of those controls in turn

#### Scenario: An arrow key reaches a header control

- **WHEN** focus sits on a cell in the grid's first row and the user presses
  the up arrow
- **THEN** focus moves to that column's header cell
- **AND** a control that header carries can take focus from there

### Requirement: A dense grid meets the target-size floor through spacing

A pointer target smaller than 24 by 24 CSS pixels SHALL sit clear of its
neighbors. Centre a 24 pixel circle on each target's box. No circle SHALL touch
another. WCAG 2.5.8 allows this spacing route. It holds a dense grid to
the standard without growing its cells.

A grid of this shape reads by density. Growing every checkbox to 24 by 24
would cost that, so the spacing route is the one to take here.

#### Scenario: Adjacent bulk badges clear the spacing floor

- **WHEN** a header cell draws its three bulk badges side by side
- **THEN** a 24 pixel circle centred on each badge touches no other badge's
  circle

#### Scenario: Adjacent cell checkboxes clear the spacing floor

- **WHEN** a data cell draws its three flag checkboxes side by side
- **THEN** a 24 pixel circle centred on each checkbox touches no other
  checkbox's circle
