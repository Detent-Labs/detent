# studio-process-tabs Specification

## Purpose

One tabbed surface holds every part of a process draft an author edits. The
tab row takes the place of the split between the edit screen and the panels
screen. No authoring job crosses a screen boundary any more.

## Requirements

### Requirement: The process surface carries one tab row

A draft SHALL open on one surface. That surface SHALL carry a tab row above
its body. The row SHALL hold ten tabs in authoring order. Those are Canvas,
Steps, Fields, Data sources, Paths, Forms, Field matrix, Contract, Changes and
Checks.

The body SHALL carry exactly one tab at a time. No index rail SHALL stand
beside the body.

#### Scenario: A draft opens on the Canvas tab

- **WHEN** an author opens a draft from the process list
- **THEN** the tab row holds ten tabs
- **AND** the Canvas tab is the open one

#### Scenario: The surface carries no index rail

- **WHEN** an author opens the Fields tab
- **THEN** the Fields editor fills the body
- **AND** no rail of tab names stands beside it

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

Every such transition SHALL announce. A blocker that returns after a fix
SHALL announce again.

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

#### Scenario: A blocker returning after a fix announces again

- **WHEN** an edit turns the worst open issue into a blocker a second time
- **AND** an earlier blocker already announced, and the author fixed it
- **THEN** the live region announces that transition too

#### Scenario: An already-blocked draft announces nothing on load

- **WHEN** a draft loads with its worst open issue already a blocker
- **THEN** the live region stays silent

#### Scenario: A fixed blocker announces nothing

- **WHEN** an edit turns the loaded draft's worst open issue from a blocker
  into a clear or advisory-only state
- **THEN** the live region stays silent

### Requirement: The open tab stands in the address

The open tab SHALL be a sub-state of the edit route, at
`/studio/processes/:id/edit/:tab`. A reload SHALL restore the same tab. An
address naming no tab SHALL open Canvas. An address naming a tab the row does
not hold SHALL open Canvas.

The form editor and the step target SHALL stay their own sub-states. The form
editor SHALL keep winning where both arrive.

#### Scenario: A reload keeps the open tab

- **WHEN** an author opens the Paths tab and reloads the browser
- **THEN** the Paths tab is the open one

#### Scenario: An unknown tab name falls back

- **WHEN** an author opens `/studio/processes/p1/edit/nonsense`
- **THEN** the Canvas tab is the open one

### Requirement: The header bar's menu holds what is not a tab

The header bar's `⋮` menu SHALL carry a second group, "Views", below the
process's own "Process, saved with the draft" group. The Views group SHALL
hold the JSON surface, Versions and Player. The tab row SHALL have no
trailing control of its own. Its trailing edge is the last tab.

The JSON entry SHALL name its own state. An author reads from it whether
the entry opens the JSON surface or leaves it.

#### Scenario: The JSON surface opens from the header bar's menu

- **WHEN** an author opens the header bar's `⋮` menu and picks the JSON
  entry
- **THEN** the JSON surface replaces the tab body
- **AND** the entry now names leaving that surface

#### Scenario: The tab row has no trailing control

- **WHEN** an author reads the tab row
- **THEN** its trailing edge is the last tab, with no overflow control
  after it

### Requirement: The draft-settings menu group carries the process-wide cancellable toggle

The header bar's `⋮` menu's "Process, saved with the draft" group SHALL carry
a control that sets `ProcessBody.cancellable`. That sits alongside its
existing `key` and `baseLocale` rows. Like those two rows, the control SHALL
mutate the draft body directly. It SHALL also be `disabled` while the JSON surface is
active (`structureActive` false), never unmounted. That matches how that
group's existing rows behave.

Unlike the step-level override, the control SHALL be a plain two-state
checkbox, offering only checked or unchecked. Here, `ProcessBody.cancellable` sits at the
root of the inheritance chain. No parent default exists there for a third
"inherit" state to name. A checked box SHALL write `cancellable: true`; an
unchecked box SHALL write `cancellable: false`. The draft's own current value
SHALL determine the box's checked state, defaulting to checked when the key is
absent.

#### Scenario: Setting the process to not cancellable

- **WHEN** an author unchecks the draft-settings group's cancellable checkbox
- **THEN** the draft's `ProcessBody` carries `cancellable: false`

#### Scenario: An unset process shows the checkbox checked

- **WHEN** the draft's `ProcessBody` has no `cancellable` key
- **THEN** the checkbox renders checked

#### Scenario: The active JSON surface disables the control

- **WHEN** the JSON surface is the active surface
- **THEN** the cancellable control renders disabled rather than unmounted,
  matching the `key` and `baseLocale` rows beside it

### Requirement: The area nav stands empty of draft controls

The studio's area nav SHALL stand empty of draft controls while a draft
stands open. Save, Discard draft and Publish stand in the header bar, as this
capability's own requirement below states. The Checks tab's own count
reports the checks state, as the count requirement above states. No control
outside the tab row SHALL duplicate that state.

#### Scenario: The area nav stands empty of draft controls

- **WHEN** an author opens a draft
- **THEN** the studio's area nav is empty of draft controls
- **AND** Save, Discard draft and Publish stand in the header bar instead

### Requirement: Save, Discard draft and Publish stand in the header bar

The process header bar SHALL carry three controls, right-aligned in its row:
Save, Discard draft and Publish. None of the three SHALL stand inside the
header bar's own `⋮` menu. All three SHALL stay visible and usable on every
tab and while the JSON surface is active.

#### Scenario: The three controls stand in the header bar, not the menu

- **WHEN** an author reads the header bar
- **THEN** Save, Discard draft and Publish stand in the header bar row, right-aligned
- **AND** the `⋮` menu carries none of the three

#### Scenario: The three controls stay reachable while the JSON surface is active

- **WHEN** an author opens the JSON surface from the overflow menu
- **THEN** Save, Discard draft and Publish still stand in the header bar row

### Requirement: A check opens the tab that owns its subject

A row in the Checks tab SHALL open the place its subject lives. An issue about
a step SHALL open the Steps tab with that step selected. An issue about a field
SHALL open the Fields tab with that field selected. An issue about a path SHALL
open the Paths tab with that path selected.

#### Scenario: A step issue opens the step

- **WHEN** an author presses a check that names a step
- **THEN** the Steps tab is the open one
- **AND** the step page stands on that step

### Requirement: A row opening another tab moves focus onto that tab

A press on a Checks row SHALL move keyboard focus onto the tab it opens. A press
on the open command of a row in the Changes tab SHALL do the same.

The pressed control stands in a body that hides once the other tab opens. Focus
SHALL NOT fall back to the page body. The focused tab SHALL carry
`tabindex="0"`, as the roving-tabindex pattern already requires of the open tab.

A check about the process itself has no owning tab, so the Checks tab stays
open. Focus SHALL then move onto the Checks tab at once. A later tab switch
SHALL NOT pull focus back to it.

Every other way of opening a tab keeps its own focus behavior.

#### Scenario: A check moves focus onto the tab it opens

- **WHEN** a keyboard user presses a check that names a path
- **THEN** the Paths tab is the open one
- **AND** keyboard focus stands on the Paths tab in the tab row

#### Scenario: A process-level check keeps focus in the tab row

- **WHEN** a keyboard user presses a check that names the process itself
- **THEN** the Checks tab stays the open one
- **AND** keyboard focus stands on the Checks tab in the tab row
- **AND** a later press on the Paths tab leaves focus on the Paths tab

<!-- antislop: allow synonym-rotation -->
<!-- Why: "change" here names a Changes-tab row; "edit" elsewhere names the general draft-edit action, an unrelated concept, not a rotated synonym. -->
#### Scenario: A change row's open command moves focus onto its tab

- **WHEN** a keyboard user opens a row under Fields on the Changes tab and
  presses its open command
- **THEN** the Fields tab is the open one
- **AND** keyboard focus stands on the Fields tab in the tab row

### Requirement: The tab row follows the area's roving-tabindex pattern

The tab row SHALL be a tab set as `spa-accessibility` already states it. It
SHALL group its tabs in a `tablist`. Each tab SHALL be a button carrying the
tab role. The open tab SHALL carry `aria-selected`.

The row carries ten tabs in one line that scrolls sideways rather than
wrapping. It SHALL follow `spa-accessibility`'s roving-tabindex pattern for
a tab set of that shape. An ordinary tab set instead follows the
plain-button pattern.

The row SHALL be one stop in the page's tab order. Its trailing edge is the
last tab, so no control beside the tabs takes a stop of its own. Exactly one
tab SHALL carry `tabindex="0"`, and the other nine `tabindex="-1"`. That one
is the open tab until an arrow key moves focus, and the focused tab
afterwards. Opening a tab SHALL bring focus and selection back together.

The left and right arrow keys SHALL move focus one tab at a time within the
row. Moving past the last tab SHALL wrap focus to the first tab. Moving
past the first SHALL wrap focus to the last. An arrow key SHALL move focus
alone. It SHALL NOT open the newly focused tab.

Enter or Space SHALL open the focused tab. The open tab's body SHALL stand
open, and the other nine SHALL hide.

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

- **WHEN** an author focuses the Checks tab, the row's last, and presses the
  right arrow key
- **THEN** focus moves to the Canvas tab, the row's first

#### Scenario: The open tab states its state under the new model

- **WHEN** a screen reader reaches the tab row
- **THEN** the open tab reports `aria-selected`
- **AND** the nine hidden bodies leave the accessibility tree

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
One case stands apart. The browser places a wholly hidden tab that takes Tab
key focus by its own focus scroll. A tab already resting in view SHALL leave
the row where it stands. The row
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
