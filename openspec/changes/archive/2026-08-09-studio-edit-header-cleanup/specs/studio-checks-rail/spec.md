## MODIFIED Requirements

### Requirement: The rail lists every open issue, grouped by source

The canvas edit screen SHALL show a checks rail in its third column, per
the `studio-canvas` capability's layout requirement. The rail SHALL list
every entry in the loaded draft's `validation.issues[]`. The rail SHALL
group entries by `source`: zod, structural, CEL, registry, and duration.

The third column SHALL show this full, grouped rail only when the
developer has selected no step and no path. See the collapsed-summary
requirement below for the step-selected state.

#### Scenario: A structural issue appears in its group

- **WHEN** the loaded draft has a structural issue on some step
- **THEN** the checks rail shows that issue under a structural group

#### Scenario: Issues across sources each show in their own group

- **WHEN** the loaded draft has a structural issue and a CEL issue
- **THEN** the checks rail shows one group for each source, each holding
  its own issue

#### Scenario: A Zod-invalid draft's issues show in their own group

- **WHEN** the loaded draft fails Zod validation (`zodValid` is false)
- **THEN** the checks rail shows those issues under a `zod` group
- **AND** the structural, CEL, registry, and duration groups show held
  back, not empty

## ADDED Requirements

### Requirement: The rail collapses to a one-line issue-count summary when the developer selects a step

Selecting a step or a path swaps the third column's content. It SHALL
show the inspector, not the full checks rail. The inspector SHALL dock a
one-line checks summary at its bottom edge.

The summary SHALL show a single count: the total number of open entries
across every group in `validation.issues[]`. The summary SHALL carry no
count when every group is clear.

When any group holds back, the summary SHALL show a held-back
indicator instead. That indicator SHALL differ from both a count and
"no count." A held-back group has not run its checks yet; it is not
clear. The summary SHALL NOT read as clear or passing while one exists.
This carries the rail's own held-back requirement into its collapsed
form.

Choosing the summary SHALL expand it to the same grouped list the full
rail shows when the developer selects nothing.

#### Scenario: Selecting a step collapses the rail to a summary

- **WHEN** the developer selects a step
- **THEN** the third column shows the inspector, and a one-line checks
  summary docks at its bottom edge

#### Scenario: The summary counts every open issue

- **WHEN** the loaded draft carries three open issues across two groups
- **THEN** the collapsed summary shows a count of three

#### Scenario: A fully clear draft's summary carries no count

- **WHEN** the loaded draft passes every check
- **THEN** the collapsed summary shows no count

#### Scenario: A structurally invalid draft's summary shows held back, not clear

- **WHEN** the loaded draft is not Zod-valid, so every group holds back
- **THEN** the collapsed summary shows a held-back indicator
- **AND** it does not show "no count"

#### Scenario: Choosing the summary expands the full grouped list

- **WHEN** the developer chooses the collapsed summary
- **THEN** the inspector's checks area expands to the same grouped list
  the full rail shows
