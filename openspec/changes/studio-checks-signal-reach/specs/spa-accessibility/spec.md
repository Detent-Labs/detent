## MODIFIED Requirements

### Requirement: A tab set matches the area's tab pattern

A tab set SHALL group its tabs in a `tablist`. Each tab SHALL be a
button carrying `role="tab"`. The active tab SHALL carry
`aria-selected`. The active tab's panel SHALL render, and the others
SHALL hide.

An ordinary tab set SHALL follow the plain-button pattern. Each tab is its
own stop in the tab order, the way a button is. Enter or Space activates
the focused tab.

A tab set carrying many tabs in one line that scrolls sideways MAY
instead follow the roving-tabindex pattern. The row is one stop in the
page's tab order. Exactly one tab carries `tabindex="0"`, and the rest
`tabindex="-1"`. That one is the active tab until an arrow key moves
focus, and the focused tab afterwards. The left and right arrow keys move
focus one tab at a time within the row. They do not activate the newly
focused tab. Enter or Space still activates it.

This is the WAI-ARIA tabs pattern's roving-tabindex variant. It exists for
a row wide enough to need it. One plain Tab stop per tab would cost a
keyboard user many presses to cross such a row. This governs
`studio-process-tabs`' own ten-tab row, the one tab set of this shape in
the browser packages today. A future tab set that takes this route
SHALL follow this same pattern rather than inventing a second one. Every
other tab set keeps the plain-button pattern.

#### Scenario: A tab activates with Enter

- **WHEN** a keyboard user focuses a tab and presses Enter
- **THEN** that tab becomes active, and its panel renders

#### Scenario: The active tab states its state

- **WHEN** a screen reader reaches the tab set
- **THEN** the active tab reports `aria-selected`, and the hidden
  panels leave the accessibility tree

#### Scenario: A roving-tabindex row keeps one tab stop

- **WHEN** a keyboard user tabs toward a many-tab row following the
  roving-tabindex pattern
- **THEN** focus lands once, on the row's active tab

#### Scenario: Arrow keys move focus within a roving-tabindex row

- **WHEN** a keyboard user presses the right arrow while focus is on a
  tab in a roving-tabindex row
- **THEN** focus moves to the next tab in the row
- **AND** that tab does not become active; only focus moves

#### Scenario: Enter activates the focused tab in a roving-tabindex row

- **WHEN** a keyboard user presses Enter on a focused, not-yet-active
  tab in a roving-tabindex row
- **THEN** that tab becomes active, and its panel renders
