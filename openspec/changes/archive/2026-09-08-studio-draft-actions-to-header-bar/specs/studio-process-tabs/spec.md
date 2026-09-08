## MODIFIED Requirements

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

## ADDED Requirements

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
