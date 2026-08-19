## ADDED Requirements

### Requirement: A tab set matches the area's tab pattern

A tab set SHALL group its tabs in a `tablist`. Each tab SHALL be a
button carrying `role="tab"`. The active tab SHALL carry
`aria-selected`. Each tab SHALL be its own stop in the tab order, the
way a button is. Enter or Space SHALL activate the focused tab. The
active tab's panel SHALL render, and the others SHALL hide.

#### Scenario: A tab activates with Enter

- **WHEN** a keyboard user focuses a tab and presses Enter
- **THEN** that tab becomes active, and its panel renders

#### Scenario: The active tab states its state

- **WHEN** a screen reader reaches the tab set
- **THEN** the active tab reports `aria-selected`, and the hidden
  panels leave the accessibility tree
