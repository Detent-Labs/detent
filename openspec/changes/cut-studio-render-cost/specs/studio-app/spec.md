# Spec Delta

## ADDED Requirements

### Requirement: A hidden tab body that derives from the whole draft shows its last visible draft

The field matrix tab and the change list SHALL stay mounted while their tab is
hidden. While hidden, each SHALL draw the draft as it stood when the tab was
last visible. The commit that reveals the tab SHALL draw the live draft.

Hiding SHALL discard no state. A selected matrix cell SHALL survive the switch
away and back.

#### Scenario: Typing on the Fields tab does not redraw the hidden matrix

- **WHEN** the Fields tab is open and the author types a character into a
  field's label
- **THEN** the field matrix tab does not re-render, and the tab body keeps the
  draft it last drew

#### Scenario: Revealing the matrix draws the live draft

- **WHEN** the author changes a field's label on the Fields tab and then opens
  the field matrix tab
- **THEN** the matrix prints the new label in the commit that reveals it

#### Scenario: A selected cell survives a round trip

- **WHEN** the author selects a matrix cell, opens another tab, changes the
  draft there and returns to the matrix tab
- **THEN** the same cell stays selected. The matrix prints the changed draft.

### Requirement: The Changes tab computes its rows while hidden

The Changes tab SHALL compute its change rows from the live draft whether or not
the tab is visible. The tab row's Changes count SHALL always equal the number of
rows the tab lists.

#### Scenario: The badge counts a hidden tab's rows

- **WHEN** the author changes a field's label on the Fields tab
- **THEN** the Changes count updates in the same commit. The change list shows
  that row once the tab opens.

### Requirement: The form editor and the player load when their screen opens

The form editor screen and the player screen SHALL each load through a dynamic
import. The build emits each as its own chunk. Opening the process surface
SHALL NOT request either chunk. Opening a step's form SHALL request the first, and opening the player the
second. A loading state SHALL stand in until the chunk arrives. The surface
SHALL keep the draft it holds.

#### Scenario: The process surface does not download the form editor

- **WHEN** an author opens a draft's process surface on the Canvas tab
- **THEN** the browser does not request the form editor's chunk

#### Scenario: Opening a form loads the form editor

- **WHEN** the author opens a step's form from the Forms tab
- **THEN** the browser requests the form editor's chunk, and the form editor
  renders once the chunk arrives

#### Scenario: Opening the player loads the player

- **WHEN** the author opens the player for a draft
- **THEN** the browser requests the player's chunk, and the player renders once
  the chunk arrives
