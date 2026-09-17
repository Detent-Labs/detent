## MODIFIED Requirements

### Requirement: The process surface carries one tab row

A draft SHALL open on one surface. That surface SHALL carry a tab row above
its body. The row SHALL hold eleven tabs in authoring order. Those are
Canvas, Steps, Fields, Data sources, Paths, Forms, Field matrix, Contract,
Changes, Checks and Access.

The body SHALL carry exactly one tab at a time. No index rail SHALL stand
beside the body.

#### Scenario: A draft opens on the Canvas tab

- **WHEN** an author opens a draft from the process list
- **THEN** the tab row holds eleven tabs
- **AND** the Canvas tab is the open one

<!-- antislop: allow negation-habit -->
<!-- title matches the archived requirement's scenario exactly, per OpenSpec's MODIFIED-block rule. -->
#### Scenario: The surface carries no index rail

- **WHEN** an author opens the Fields tab
- **THEN** the Fields editor fills the body
- **AND** no rail of tab names stands beside it

### Requirement: The tab row follows the area's roving-tabindex pattern

The tab row SHALL be a tab set as `spa-accessibility` already states it. It
SHALL group its tabs in a `tablist`. Each tab SHALL be a button carrying the
tab role. The open tab SHALL carry `aria-selected`.

The row carries eleven tabs in one line that scrolls sideways rather than
wrapping. It SHALL follow `spa-accessibility`'s roving-tabindex pattern for
a tab set of that shape. An ordinary tab set instead follows the
plain-button pattern.

The row SHALL be one stop in the page's tab order. Its trailing edge is the
last tab, so no control beside the tabs takes a stop of its own. Exactly one
tab SHALL carry `tabindex="0"`, and the other ten `tabindex="-1"`. That one
is the open tab until an arrow key moves focus, and the focused tab
afterwards. Opening a tab SHALL bring focus and selection back together.

Enter or Space SHALL open the focused tab. The open tab's body SHALL stand
open, and the other ten SHALL hide.

#### Scenario: The row is one tab stop

- **WHEN** an author presses Tab from the header bar
- **THEN** focus lands on the open tab
- **AND** a further Tab press leaves the row

#### Scenario: An arrow key moves focus without opening the tab

- **WHEN** an author focuses the Canvas tab and presses the right arrow key
- **THEN** focus moves to the Steps tab
- **AND** the Canvas tab's body stays open

#### Scenario: Enter opens the focused tab

- **WHEN** an author focuses the Paths tab and presses Enter
- **THEN** the Paths tab is the open one, and its body stands open

#### Scenario: Arrow-key focus wraps at the row's ends

- **WHEN** an author focuses the Access tab, the row's last, and presses the
  right arrow key
- **THEN** focus moves to the Canvas tab, the row's first

#### Scenario: The open tab states its state under the new model

- **WHEN** a screen reader reaches the tab row
- **THEN** the open tab reports `aria-selected`
- **AND** the ten hidden bodies leave the accessibility tree
