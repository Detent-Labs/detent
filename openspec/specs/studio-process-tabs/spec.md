# studio-process-tabs Specification

## Purpose

One tabbed surface holds every part of a process draft an author edits. The
tab row takes the place of the split between the edit screen and the panels
screen. No authoring job crosses a screen boundary any more.

## Requirements

### Requirement: The process surface carries a tab row of six tabs

A draft SHALL open on one surface. That surface SHALL carry a tab row above
its body. The row SHALL hold six tabs in authoring order. Those are Map,
Steps, Fields, Forms, Checks and Settings. The body SHALL carry exactly one
tab at a time. No index rail SHALL stand beside the body.

#### Scenario: A draft opens on the Map tab

- **WHEN** an author opens a draft from the process list
- **THEN** the tab row holds six tabs
- **AND** the Map tab is the open one

#### Scenario: The surface has no index rail

- **WHEN** an author opens the Fields tab
- **THEN** the Fields editor fills the body
- **AND** no rail of tab names stands beside it

#### Scenario: No tab names a retired subject

- **WHEN** an author reads the tab row
- **THEN** no tab reads Paths, Field matrix, Data sources, Contract,
  Changes or Access

### Requirement: Each tab prints the count of what it holds

A tab SHALL print a count beside its name where a count has a meaning.
Steps counts the draft's steps, and Fields counts the catalog's fields.
Forms counts the steps that carry a view, and Checks counts the open issues.
Map and Settings SHALL print no count. A count SHALL follow an edit at once,
without a reload.

#### Scenario: Adding a step raises the Steps count

- **WHEN** an author adds a step on the Map tab
- **THEN** the Steps tab's count rises by one

#### Scenario: A countless tab prints a name alone

- **WHEN** an author reads the tab row
- **THEN** the Map tab and the Settings tab print no number

### Requirement: The Checks count carries the blocker state

The Checks count SHALL carry the blocker color and bold weight. It does so
while the loaded draft's worst open issue is a blocker. It SHALL stay uncolored for a
clear draft and for an advisory-only draft. No other tab's count carries a
state color. The state SHALL carry a visually hidden text equivalent.

A live region SHALL announce the move into the blocker state once. It SHALL stay
silent on load, on a further blocked edit and on the move out of it.

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
address naming no tab SHALL open Map. An address naming a tab the row does
not hold SHALL open Map.

A tab holding a sub-row SHALL carry its open view as a further segment, at
`/studio/processes/:id/edit/:tab/:view`. An address naming the tab alone
SHALL open that tab's first view. An address naming a view the tab does not
hold SHALL open that first view too.

The form editor and the step target SHALL stay their own sub-states. The form
editor SHALL keep winning where both arrive.

On the form editor's address, the tab row SHALL stand Steps current. An open
from a Forms card SHALL stand Forms current until the author leaves the
editor. A
reload of the form editor's address stands Steps current
(`studio-form-editor`).

Every address the eleven-tab row answered SHALL still open a place. The
address `/edit/canvas` SHALL open Map. The address `/edit/paths` SHALL open
Steps. The address `/edit/matrix` SHALL open the Fields tab's matrix view.

The addresses `/edit/dataSources`, `/edit/contract` and `/edit/access` SHALL
open their Settings view. The address `/edit/changes` SHALL open the Versions
screen. The retired `/edit/panels/:view` addresses SHALL follow the same map.

#### Scenario: A reload keeps the open tab

- **WHEN** an author opens the Forms tab and reloads the browser
- **THEN** the Forms tab is the open one

#### Scenario: An unknown tab name falls back

- **WHEN** an author opens `/studio/processes/p1/edit/nonsense`
- **THEN** the Map tab is the open one

#### Scenario: A view stands in the address

- **WHEN** an author opens Where fields appear on the Fields tab
- **THEN** the address reads `/studio/processes/p1/edit/fields/matrix`
- **AND** a reload opens that same view

#### Scenario: An unknown view name falls back to the first view

- **WHEN** an author opens `/studio/processes/p1/edit/settings/nonsense`
- **THEN** the Settings tab is the open one, on its Process view

#### Scenario: A retired tab address opens the new place

- **WHEN** an author opens `/studio/processes/p1/edit/dataSources`
- **THEN** the Settings tab is the open one, on Where values come from

#### Scenario: The retired Changes address opens the Versions screen

- **WHEN** an author opens `/studio/processes/p1/edit/changes`
- **THEN** the Versions screen opens for that process

#### Scenario: The form editor's address stands Steps current

- **WHEN** an author loads `/studio/processes/p1/edit/form/step_1` directly
- **THEN** the form editor opens with the Steps tab current

### Requirement: The header bar's menu holds what is not a tab

The header bar's `⋮` menu SHALL carry one group, "Views". The Views group
SHALL hold the JSON surface, Versions and Player. No process setting SHALL
stand in the menu. The Settings tab holds those. The tab row SHALL have no
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

#### Scenario: The menu has no process setting

- **WHEN** an author opens the header bar's `⋮` menu
- **THEN** it holds the JSON entry, Versions and Player
- **AND** no key, language, cancellable or collaboration control stands in it

### Requirement: A sub-row holds a tab's views

A tab with more than one view SHALL carry a sub-row under the tab row. The
sub-row SHALL be a tab set following `spa-accessibility`'s plain-button
pattern. Each entry SHALL be its own tab stop. The open view SHALL stand in
the address. Every view's body SHALL stay mounted while another view is
open, and `hidden` reveals one. A sub-row entry SHALL print no count.

#### Scenario: A sub-row entry is a plain tab stop

- **WHEN** a keyboard user presses Tab from the tab row on the Fields tab
- **THEN** focus lands on the sub-row's first entry
- **AND** a further Tab press lands on its second entry

#### Scenario: A hidden view keeps its state

- **WHEN** an author selects a matrix cell, opens Catalog, then returns to
  Where fields appear
- **THEN** the same cell is still selected

### Requirement: The Fields tab carries the catalog and the matrix as views

The Fields tab's sub-row SHALL read Catalog and Where fields appear, in
that order. Catalog SHALL hold the entity rail and the field editor. Where
fields appear SHALL hold the field matrix with its toolbar, its count line
and its legend. The tab's count SHALL count the catalog's fields.

#### Scenario: The matrix opens as a view of Fields

- **WHEN** an author opens the Fields tab and picks Where fields appear
- **THEN** the field matrix fills the body under the sub-row
- **AND** the Fields tab stays the open tab

#### Scenario: The matrix view keeps the toolbar and the legend

- **WHEN** an author reads Where fields appear
- **THEN** the Hide-inert toggle, the count line and the legend stand above
  the grid

### Requirement: The Settings tab gathers the process-wide settings

The Settings tab's sub-row SHALL read Process, Where values come from, What
it takes in and gives back, and Access. The Process view SHALL hold four settings. They are the base
language, the add-a-language control, the cancellable setting and the two
collaboration defaults. Each is a labelled control that writes the draft
body. The process key SHALL stand in a closed Developer view there. The
Access view SHALL also carry the link to manage assignment groups.

#### Scenario: Setting the process to not cancellable

- **WHEN** an author unchecks the cancellable setting on the Process view
- **THEN** the draft's `ProcessBody` carries `cancellable: false`

#### Scenario: An unset process shows the cancellable setting checked

- **WHEN** the draft's `ProcessBody` has no `cancellable` key
- **THEN** the cancellable checkbox renders checked

#### Scenario: Unchecking a collaboration default disables it process-wide

- **WHEN** an author unchecks the attachments setting on the Process view
- **THEN** the draft's `collaboration.attachments` is `false`

#### Scenario: The key stands behind the Developer view

- **WHEN** an author opens the Process view
- **THEN** no key prints until the Developer view opens
- **AND** the open Developer view holds the key input in the mono face

#### Scenario: The data sources keep their rail and editor

- **WHEN** an author opens Where values come from
- **THEN** the entity rail lists every data source and an Add entry
- **AND** the open data source's editor stands beside it

#### Scenario: The contract and the access lists keep their editors

- **WHEN** an author opens What it takes in and gives back, then Access
- **THEN** the first view holds the contract editor
- **AND** the second holds the Developer, Owner and Reader lists, and the
  assignment-groups link under them

#### Scenario: The JSON surface hides the Settings tab

- **WHEN** the JSON surface is the active surface
- **THEN** no Settings control is reachable until the author leaves it

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
a step SHALL open the Steps tab with that step selected. An issue about a
timer or an action SHALL open the Steps tab with the step that carries it
selected. An issue about a path SHALL open the Steps tab on the step the
path leaves. That way out SHALL read as selected there.

An issue about a field SHALL open the Fields tab's Catalog view. An issue
about a data source SHALL open the Settings tab's Where values come from
view. An issue about the contract SHALL open the Settings tab's What it takes
in and gives back view. An issue about the process itself SHALL leave the
Checks tab open.

#### Scenario: A step issue opens the step

- **WHEN** an author presses a check that names a step
- **THEN** the Steps tab is the open one
- **AND** the step page stands on that step

#### Scenario: A path issue opens the step that leaves by it

- **WHEN** an author presses a check that names a path
- **THEN** the Steps tab is the open one
- **AND** the step page stands on the step the path leaves
- **AND** that way out's row reads as selected

#### Scenario: A data source issue opens its Settings view

- **WHEN** an author presses a check that names a data source
- **THEN** the Settings tab is the open one, on Where values come from

### Requirement: A check opening another tab moves focus onto that tab

A press on a Checks row SHALL move keyboard focus onto the tab it opens. The
pressed control stands in a body that hides once the other tab opens. Focus
SHALL NOT fall back to the page body. The focused tab SHALL carry
`tabindex="0"`. A check about the process itself keeps the Checks tab open.
Focus SHALL then move onto the Checks tab at once, and a later tab switch
SHALL NOT pull it back.

#### Scenario: A check moves focus onto the tab it opens

- **WHEN** a keyboard user presses a check that names a field
- **THEN** the Fields tab is the open one
- **AND** keyboard focus stands on the Fields tab in the tab row

#### Scenario: A process-level check keeps focus in the tab row

- **WHEN** a keyboard user presses a check that names the process itself
- **THEN** the Checks tab stays the open one
- **AND** keyboard focus stands on the Checks tab in the tab row
- **AND** a later press on the Steps tab leaves focus on the Steps tab

### Requirement: The tab row follows the area's roving-tabindex pattern

The tab row SHALL be a tab set as `spa-accessibility` already states it. It
SHALL group its tabs in a `tablist`. Each tab SHALL be a button carrying the
tab role. The open tab SHALL carry `aria-selected`.

The row carries six tabs in one line that scrolls sideways rather than
wrapping. It SHALL follow `spa-accessibility`'s roving-tabindex pattern for
a tab set of that shape. An ordinary tab set instead follows the
plain-button pattern.

The row SHALL be one stop in the page's tab order. Its trailing edge is the
last tab, so no control beside the tabs takes a stop of its own. Exactly one
tab SHALL carry `tabindex="0"`, and the other five `tabindex="-1"`. That one
is the open tab until an arrow key moves focus, and the focused tab
afterwards. Opening a tab SHALL bring focus and selection back together.

The left and right arrow keys SHALL move focus one tab at a time within the
row. Moving past the last tab SHALL wrap focus to the first tab. Moving
past the first SHALL wrap focus to the last. An arrow key SHALL move focus
alone. It SHALL NOT open the newly focused tab.

Enter or Space SHALL open the focused tab. The open tab's body SHALL stand
open, and the other five SHALL hide.

#### Scenario: The row is one tab stop

- **WHEN** an author presses Tab from the header bar
- **THEN** focus lands on the open tab
- **AND** a further Tab press leaves the row

#### Scenario: An arrow key moves focus without opening the tab

- **WHEN** an author focuses the Map tab and presses the right arrow key
- **THEN** focus moves to the Steps tab
- **AND** the Map tab's body stays open

#### Scenario: Enter opens the focused tab

- **WHEN** an author focuses the Forms tab and presses Enter
- **THEN** the Forms tab is the open one, and its body stands open

#### Scenario: Arrow-key focus wraps at the row's ends

- **WHEN** an author focuses the Settings tab, the row's last, and presses
  the right arrow key
- **THEN** focus moves to the Map tab, the row's first

#### Scenario: The open tab states its state under the new model

- **WHEN** a screen reader reaches the tab row
- **THEN** the open tab reports `aria-selected`
- **AND** the five hidden bodies leave the accessibility tree

### Requirement: The open tab rests whole in the tab row's view

The row SHALL scroll the open tab whole into its visible range, clear of the
edge fades, at three moments. One is when a draft opens, whatever address
opened it. Another is every tab switch, whatever switched the tab. The third
is when the row's own width moves. Between those moments an author MAY
scroll the row freely.

A tab rests in view when its box stands whole inside the visible range. It
also keeps 32px clear of each edge the row can still scroll past, with 1px
of slack.

#### Scenario: A tab opened by its address lands in view

- **WHEN** an author opens a draft at `/studio/processes/:id/edit/settings`,
  in a window 400px wide
- **THEN** the Settings tab stands whole inside the row's visible range
- **AND** it stands clear of both edge fades

#### Scenario: A tab switch with no focus move scrolls the new tab into view

- **WHEN** an author at 400px opens the Map tab from the Settings tab, then
  presses the browser's Back button
- **THEN** the Settings tab is the open one again
- **AND** the Settings tab stands whole in view

#### Scenario: Narrowing the window keeps the open tab in view

- **WHEN** an author opens the Settings tab in a window 1440px wide, then
  narrows the window to 400px
- **THEN** the Settings tab stands whole in view

#### Scenario: A tab already in view leaves the row still

- **WHEN** an author at 400px scrolls the row to its start and opens the
  Steps tab
- **THEN** the row keeps its scroll position

### Requirement: A focused tab rests whole in the tab row's view

A tab that takes focus from an arrow key SHALL stand whole in view. So SHALL
a tab that takes focus from a Checks row's focus hand-off. So SHALL a tab
that takes keyboard focus from the Tab key.

#### Scenario: A row command's focus hand-off lands the tab in view

- **WHEN** the tab row stands at its end in a window 400px wide
- **AND** a keyboard user presses a check that names a step
- **THEN** keyboard focus stands on the Steps tab
- **AND** the Steps tab stands whole in view, clear of the edge fade

#### Scenario: An arrow key lands the focused tab in view

- **WHEN** a keyboard user at 400px focuses the Steps tab and presses the
  right arrow key three times
- **THEN** keyboard focus stands on the Checks tab
- **AND** the Checks tab stands whole in view, clear of the edge fade

#### Scenario: The Tab key lands the open tab in view

- **WHEN** an author at 400px scrolls the open Forms tab partly past the
  row's trailing edge
- **AND** a keyboard user presses the Tab key from the control before the row
- **THEN** keyboard focus stands on the Forms tab
- **AND** the Forms tab stands whole in view, clear of the edge fade

### Requirement: The tab row moves by the least distance

The row SHALL move by the least distance that brings a tab to rest in view.
A tab already resting in view SHALL leave the row where it stands. The row
SHALL jump to its new position, with no animated scroll. It SHALL stay one
line, and the tab body under it SHALL keep its place. A pointer press on a
partly visible tab SHALL open that tab. The row SHALL move only once the
press has ended.

#### Scenario: A press on a partly visible tab opens it

- **WHEN** an author at 400px scrolls the row to its start
- **AND** presses the visible part of the Settings tab
- **THEN** the Settings tab is the open one
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

Two gaps SHALL NOT raise the banner on their own. One is the missing first
step of a draft with no step, the start state `studio-checks-rail` defines.
The other is the missing base-locale name of a draft that holds a step.
That gap reads as a sentence at the name. The banner SHALL stand only when the
draft carries some other Zod issue.

This banner SHALL NOT take the bordered, rotated stamp treatment. This
screen already reserves that treatment for a load or a request that comes
back wrong. That treatment marks a fixed, five-tone case vocabulary a
design decision alone extends. A structurally invalid draft joins the
plain-text signal family instead.

<!-- antislop: allow synonym-rotation -->
<!-- Copied from the live spec; "failure" names a failed request, the case this paragraph sets apart from a Zod issue. -->
`spa-error-reporting` binds this screen's failure states to one banner
shape. That capability's own Purpose scopes it to a request that fails.
This banner reports a validation state of the draft body rather than a
failed request. So that one-shape rule does not reach it.

#### Scenario: A structurally invalid draft's banner carries the refusal color

- **WHEN** the loaded draft fails structural validation on a Zod issue
  other than the two start gaps
- **THEN** its banner takes `colors.refusal`
- **AND** it does not take the bordered stamp treatment

#### Scenario: A structurally valid draft shows no such banner

- **WHEN** the loaded draft passes structural validation
- **THEN** no such banner stands

#### Scenario: A fresh empty draft shows no banner

- **WHEN** an author opens a draft the empty choice just seeded
- **THEN** no banner stands above the header bar

#### Scenario: An unnamed draft with a step shows no banner

- **WHEN** the loaded draft holds one named end step, and its only Zod
  issue is the missing base-locale name
- **THEN** no banner stands
- **AND** the name sentence stands beside the name in the header bar

#### Scenario: Another Zod issue keeps the banner on a draft with no step

- **WHEN** a draft with no step also carries a Zod issue of another kind
- **THEN** the banner stands

#### Scenario: A new task step with no name or way out keeps the banner

- **WHEN** an author adds a first task step that has no name and no way out
- **THEN** the banner stands, since those two gaps lie outside the start
  gaps
