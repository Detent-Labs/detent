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

### Requirement: An overflow menu holds what is not a tab

The tab row SHALL carry an overflow control at its trailing edge. The menu
SHALL hold the JSON surface, Versions and Player. The Structure and JSON pair
beside the header bar SHALL NOT stand any more.

The JSON entry SHALL name its own state. An author reads from it whether the
entry opens the JSON surface or leaves it.

#### Scenario: The JSON surface opens from the overflow menu

- **WHEN** an author opens the overflow menu and picks the JSON entry
- **THEN** the JSON surface replaces the tab body
- **AND** the entry now names leaving that surface

#### Scenario: The header bar carries no surface pair

- **WHEN** an author reads the header bar
- **THEN** no Structure control and no JSON control stand in it

### Requirement: Checks stands in the area nav with a state dot

The studio's area nav SHALL carry one control, Checks. The header bar's own
menu SHALL carry no Checks control. The Checks control SHALL carry a dot and
the open issue count. The dot SHALL read the worst open issue. One color marks
a blocker, one marks an advisory issue, and one marks a clear draft.

Pressing Checks SHALL open the Checks tab.

#### Scenario: A blocking issue colors the dot

- **WHEN** a draft holds one step that leads nowhere
- **THEN** the Checks dot carries the blocker color
- **AND** the count beside it reads the number of open issues

#### Scenario: Checks opens its own tab

- **WHEN** an author presses the Checks control in the area nav
- **THEN** the Checks tab is the open one

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

### Requirement: The tab row follows the area's own tab pattern

The tab row SHALL be a tab set as `spa-accessibility` already states it. It
SHALL group its tabs in a `tablist`. Each tab SHALL be a button carrying the
tab role. The open tab SHALL carry `aria-selected`.

Each tab SHALL be its own stop in the tab order, the way a button is. Enter or
Space SHALL open the focused tab. The open tab's body SHALL stand open, and
the other nine SHALL hide. This row introduces no roving tab stop and no arrow-key
model of its own.

#### Scenario: A tab opens with Enter

- **WHEN** an author focuses the Paths tab and presses Enter
- **THEN** the Paths tab is the open one, and its body stands open

#### Scenario: Every tab is its own stop

- **WHEN** an author presses Tab from the header bar
- **THEN** the focus lands on the first tab
- **AND** a further Tab press moves to the second tab

#### Scenario: The open tab states its state

- **WHEN** a screen reader reaches the tab row
- **THEN** the open tab reports `aria-selected`
- **AND** the nine hidden bodies leave the accessibility tree
