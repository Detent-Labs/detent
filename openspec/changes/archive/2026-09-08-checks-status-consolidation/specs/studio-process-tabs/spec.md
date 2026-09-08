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

The blocker color SHALL carry a text equivalent, visually hidden, so the
state reaches a screen reader too. Color alone reaches none.

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
- **THEN** the Checks tab's count carries the blocker color
- **AND** the count itself reads the number of open issues

#### Scenario: A clear draft's Checks count has no state color

- **WHEN** the loaded draft has no open issue
- **THEN** the Checks tab's count reads 0, in the tab row's ordinary color

#### Scenario: An advisory-only draft's Checks count has no state color

- **WHEN** the loaded draft's open issues are all advisory, none a blocker
- **THEN** the Checks tab's count reads the issue count, in the tab row's
  ordinary color

#### Scenario: The blocker state carries a text equivalent

- **WHEN** the loaded draft's worst open issue is a blocker
- **THEN** the Checks tab's accessible name states that fact in words

## ADDED Requirements

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

## REMOVED Requirements

### Requirement: Checks stands in the area nav with a state dot

**Reason**: Live-tested against the tab row's own Checks tab. The area nav's
Checks control opened that same tab. It did nothing else, in either place.
It was a second control for one destination.

Its state dot was the one part worth keeping. That job now belongs to the
Checks tab's own count. See this capability's "A tab carries the count of
what it holds" requirement.

**Migration**: An author reaches the Checks tab through the tab row alone,
as with every other tab. The tab row's "Checks" count now carries the color
the removed control's dot used to carry. See "A tab carries the count of
what it holds" above. See "The area nav stands empty of draft controls" above
too.
