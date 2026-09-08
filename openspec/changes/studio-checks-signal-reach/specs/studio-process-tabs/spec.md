## MODIFIED Requirements

### Requirement: A tab carries the count of what it holds

A tab SHALL print a count beside its name where a count has a meaning. Steps
counts the draft's steps. Fields counts the catalog's fields. Data sources
counts the declared sources. Paths counts every path in the process.

Forms counts the steps that carry a view. Changes counts the differences
against the base version. Checks counts the open issues. Field matrix counts
its own view findings, and its declared-entry total stays in the matrix
toolbar's count line. Canvas and Contract SHALL print no count.

A count SHALL follow an edit at once, without a reload.

The Checks count SHALL also carry a state color. It SHALL carry the blocker
color when the loaded draft's worst open issue is a blocker. It SHALL carry
its ordinary, uncolored state in every other case. That covers a clear
draft, and a draft whose open issues are all advisory. No other tab's count
carries a state color.

The blocker color SHALL also carry bold weight. Weight reads faster than
color alone at a glance.

The blocker color SHALL carry a text equivalent, visually hidden, so the
state reaches a screen reader too. Color alone reaches none.

A screen reader user away from the tab row SHALL also hear the count's
transition into the blocker state. The studio SHALL announce that
transition once, through a live region. That announcement fires the moment
the count's state moves from clear or advisory-only to blocker. The live
region SHALL stay silent otherwise. That covers three cases. A draft that
loads already blocked, a further edit that stays blocked, and the reverse
transition out of blocker.

#### Scenario: Adding a step raises the Steps count

- **WHEN** an author adds a step on the Canvas tab
- **THEN** the Steps tab's count rises by one

#### Scenario: A countless tab prints a name alone

- **WHEN** an author reads the tab row
- **THEN** the Canvas tab and the Contract tab print no number

#### Scenario: The Field matrix tab counts its findings

- **WHEN** one view entry draws a view finding
- **THEN** the Field matrix tab reads one
- **AND** the matrix toolbar keeps its own declared-entry total

#### Scenario: A blocking issue colors the Checks count

- **WHEN** a draft holds one step that leads nowhere
- **THEN** the Checks tab's count carries the blocker color and bold weight
- **AND** the count itself reads the number of open issues

#### Scenario: A clear draft's Checks count has no state color

- **WHEN** the loaded draft has no open issue
- **THEN** the Checks tab's count reads 0, in the tab row's ordinary color
  and weight

#### Scenario: An advisory-only draft's Checks count has no state color

- **WHEN** the loaded draft's open issues are all advisory, none a blocker
- **THEN** the Checks tab's count reads the issue count, in the tab row's
  ordinary color and weight

#### Scenario: The blocker state carries a text equivalent

- **WHEN** the loaded draft's worst open issue is a blocker
- **THEN** the Checks tab's accessible name states that fact in words

#### Scenario: A new blocker announces itself

- **WHEN** an edit turns the loaded draft's worst open issue into a blocker,
  where it was not one before
- **THEN** a live region announces that transition once

#### Scenario: An already-blocked draft announces nothing on load

- **WHEN** a draft loads with its worst open issue already a blocker
- **THEN** the live region stays silent

#### Scenario: A fixed blocker announces nothing

- **WHEN** an edit turns the loaded draft's worst open issue from a blocker
  into a clear or advisory-only state
- **THEN** the live region stays silent

## ADDED Requirements

### Requirement: The tab row follows the area's roving-tabindex pattern

The tab row SHALL be a tab set as `spa-accessibility` already states it. It
SHALL group its tabs in a `tablist`. Each tab SHALL be a button carrying the
tab role. The open tab SHALL carry `aria-selected`.

The row carries ten tabs in one line that scrolls sideways rather than
wrapping. It SHALL follow `spa-accessibility`'s roving-tabindex pattern for
a tab set of that shape. An ordinary tab set instead follows the
plain-button pattern.

The row's ten tabs SHALL together be one stop in the page's tab order. The
overflow control at the row's trailing edge keeps its own stop, as it does
today. Exactly one tab SHALL carry `tabindex="0"`, and the other nine
`tabindex="-1"`. That one is the open tab until an arrow key moves focus,
and the focused tab afterwards. Opening a tab SHALL bring focus and
selection back together.

The left and right arrow keys SHALL move focus one tab at a time within the
row. Moving past the last tab SHALL wrap focus to the first tab. Moving
past the first SHALL wrap focus to the last. An arrow key SHALL move focus
alone. It SHALL NOT open the newly focused tab.

Enter or Space SHALL open the focused tab. The open tab's body SHALL stand
open, and the other nine SHALL hide.

#### Scenario: The row's tabs are one tab stop

- **WHEN** an author presses Tab from the header bar
- **THEN** focus lands on the open tab
- **AND** a further Tab press moves to the overflow control, and the one
  after that leaves the row

#### Scenario: An arrow key moves focus without opening the tab

- **WHEN** an author focuses the Canvas tab and presses the right arrow key
- **THEN** focus moves to the Steps tab
- **AND** the Canvas tab's body stays open

#### Scenario: Enter opens the focused tab

- **WHEN** an author focuses the Paths tab and presses Enter
- **THEN** the Paths tab is the open one, and its body stands open

#### Scenario: Arrow-key focus wraps at the row's ends

- **WHEN** an author focuses the Checks tab, the row's last, and presses the
  right arrow key
- **THEN** focus moves to the Canvas tab, the row's first

#### Scenario: The open tab states its state under the new model

- **WHEN** a screen reader reaches the tab row
- **THEN** the open tab reports `aria-selected`
- **AND** the nine hidden bodies leave the accessibility tree

### Requirement: A structurally invalid draft's banner carries the refusal color

Where the loaded draft fails structural validation, its warning banner
SHALL take `colors.refusal`. That is the color the Checks tab's blocked
count already carries. Plain, uncolored text left that state reading no
differently from routine copy.

This banner SHALL NOT take the bordered, rotated stamp treatment. This
screen already reserves that treatment for a load or a request that comes
back wrong. That treatment marks a fixed, five-tone case vocabulary a
design decision alone extends. A structurally invalid draft joins the
plain-text signal family instead.

`spa-error-reporting` binds this screen's failure states to one banner
shape. That capability's own Purpose scopes it to a request that fails.
This banner reports a validation state of the draft body rather than a
failed request. So that one-shape rule does not reach it.

#### Scenario: A structurally invalid draft's banner carries the refusal color

- **WHEN** the loaded draft fails structural validation
- **THEN** its banner takes `colors.refusal`
- **AND** it does not take the bordered stamp treatment

#### Scenario: A structurally valid draft shows no such banner

- **WHEN** the loaded draft passes structural validation
- **THEN** no such banner stands

## REMOVED Requirements

### Requirement: The tab row follows the area's own tab pattern

**Reason**: This row moves to the roving-tabindex model. That model
contradicts this requirement's own "Every tab is its own stop" scenario. A
MODIFIED block cannot drop a scenario. The replacement lands as its own
requirement above, "The tab row follows the area's roving-tabindex
pattern."

**Migration**: The `tablist` grouping, the tab role, `aria-selected` and
the Enter-or-Space activation all carry over unchanged into that new
requirement. Only the tab-order model changes. Every tab took its own stop
before; the row takes one stop now.
