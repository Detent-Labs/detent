## ADDED Requirements

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

#### Scenario: A change row's open command moves focus onto its tab

- **WHEN** a keyboard user opens a row under Fields on the Changes tab and
  presses its open command
- **THEN** the Fields tab is the open one
- **AND** keyboard focus stands on the Fields tab in the tab row
