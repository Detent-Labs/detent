## ADDED Requirements

### Requirement: The open tab stands whole in the tab row's view

The row SHALL scroll the open tab whole into its visible range, clear of the
edge fades, at four moments. One is when a draft opens, whatever address
opened it. Another is every tab change, whatever changed the tab. The third
is when the row's own width changes. The fourth is when a tab's width change
moves an open tab that rested in view. Between those moments an author MAY
scroll the row freely.

A tab rests in view when its box stands whole inside the visible range. At
each edge the row can still scroll past, the box also keeps 32px clear. Each
measure allows 1px of slack.

A tab that takes focus from an arrow key SHALL stand whole in view the same
way. So SHALL a tab that takes focus from a row command's focus hand-off. So
SHALL a tab that takes keyboard focus from the Tab key.

The row SHALL move by the least distance that brings the tab to rest in view.
A tab already resting in view SHALL leave the row where it stands. The row
SHALL jump to its new position, with no animated scroll. It SHALL stay one
line, and the tab body under it SHALL keep its place.

A pointer press on a partly visible tab SHALL open that tab. The row SHALL
move only once the press has ended.

#### Scenario: A tab opened by its address lands in view

- **WHEN** an author opens a draft at `/studio/processes/:id/edit/forms`, in
  a window 400px wide
- **THEN** the Forms tab stands whole inside the row's visible range
- **AND** it stands clear of both edge fades

#### Scenario: A count that prints late keeps the open tab in view

- **WHEN** an author opens a draft that differs from its base version at
  `/studio/processes/:id/edit/checks`, in a window 400px wide
- **AND** the Changes tab's count prints after the row's first scroll
- **THEN** the Checks tab still stands whole in view

#### Scenario: A tab change with no focus move scrolls the new tab into view

- **WHEN** an author at 400px opens the Canvas tab from the Forms tab, then
  presses the browser's Back button
- **THEN** the Forms tab is the open one again
- **AND** the Forms tab stands whole in view

#### Scenario: A row command's focus hand-off lands the tab in view

- **WHEN** the tab row stands at its end in a window 400px wide
- **AND** a keyboard user presses the open command of a row under Fields on
  the Changes tab
- **THEN** keyboard focus stands on the Fields tab
- **AND** the Fields tab stands whole in view, clear of the edge fade

#### Scenario: An arrow key lands the focused tab in view

- **WHEN** a keyboard user at 400px focuses the Forms tab and presses the
  right arrow key three times
- **THEN** keyboard focus stands on the Changes tab
- **AND** the Changes tab stands whole in view, clear of the edge fade

#### Scenario: The Tab key lands the open tab in view

- **WHEN** an author at 400px scrolls the open Forms tab partly past the
  row's trailing edge
- **AND** a keyboard user presses the Tab key from the control before the row
- **THEN** keyboard focus stands on the Forms tab
- **AND** the Forms tab stands whole in view, clear of the edge fade

#### Scenario: Narrowing the window keeps the open tab in view

- **WHEN** an author opens the Forms tab in a window 1440px wide, then
  narrows the window to 400px
- **THEN** the Forms tab stands whole in view

#### Scenario: A tab already in view leaves the row still

- **WHEN** an author at 400px scrolls the row to its start and opens the
  Fields tab
- **THEN** the row keeps its scroll position

#### Scenario: A press on a partly visible tab opens it

- **WHEN** an author at 400px scrolls the row to its start
- **AND** presses the visible part of the Data sources tab
- **THEN** the Data sources tab is the open one
- **AND** it then stands whole in view

### Requirement: An edge of the tab row fades where more tabs lie past it

Where tabs lie past an edge of the row's visible range, that edge SHALL fade
the tabs out over 24px. An edge with no tab past it SHALL NOT fade. A row
wide enough for every tab SHALL have no fade.

A fade SHALL follow the row's scroll position, its width and its tabs'
widths at once. It SHALL appear and leave with no animation.

A fade SHALL cover the tabs alone. The row's 2px divider and its scrollbar
SHALL stay at full strength under it.

A fade is no control. It SHALL take no tab stop and add nothing to the
accessibility tree. A pointer press inside a fade SHALL reach the tab under
it.

Under forced colors the row SHALL have no fade. Its scrollbar stays the
cue that more tabs lie past an edge.

#### Scenario: The row at its start fades its trailing edge alone

- **WHEN** the row stands at its start in a window 400px wide
- **THEN** its trailing edge fades
- **AND** its leading edge does not

#### Scenario: The row mid-scroll fades both edges

- **WHEN** the row stands between its start and its end
- **THEN** both of its edges fade

#### Scenario: The row at its end fades its leading edge alone

- **WHEN** the row stands at its end
- **THEN** its leading edge fades
- **AND** its trailing edge does not

#### Scenario: A row with room for every tab has no fade

- **WHEN** a draft opens in a window 1440px wide
- **THEN** neither edge of the row fades

#### Scenario: A fade leaves the divider and the scrollbar whole

- **WHEN** a fade stands beside a visible scrollbar
- **THEN** the 2px divider and the scrollbar keep full strength under the
  fade

#### Scenario: A press inside a fade reaches the tab

- **WHEN** an author presses the faded part of a tab
- **THEN** that tab opens

#### Scenario: Forced colors leave the row with no fade

- **WHEN** forced colors are active in a window 400px wide
- **THEN** neither edge of the row fades
- **AND** every visible tab label keeps its full contrast
