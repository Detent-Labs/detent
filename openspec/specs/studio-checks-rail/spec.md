# studio-checks-rail Specification

## Purpose

The canvas edit screen's third column when the developer selects
nothing. Selecting a step or a path instead docks a collapsed summary
at the inspector's bottom edge. Both forms group every open validation
issue for the loaded draft by source. Both give an author one place to
see everything holding a publish back.

## Requirements

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

### Requirement: The rail collapses to a one-line issue-count summary when the developer selects a step

Selecting a step or a path swaps the third column's content. It SHALL
show the inspector, not the full checks rail. The inspector SHALL dock a
one-line checks summary at its bottom edge.

Selecting more than one step swaps that content again. The third column
SHALL then show the selection's own count and delete control, which the
`studio-canvas` capability states. That summary SHALL dock the same
one-line checks summary at its bottom edge. An author therefore reads the
issue count in every state of the column but one. The full rail's own state
needs no summary, since its grouped list already carries the count.

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

#### Scenario: Selecting several steps keeps the docked summary

- **WHEN** the developer selects more than one step
- **THEN** the third column shows the selection count and its delete
  control
- **AND** the one-line checks summary docks at that summary's bottom edge

### Requirement: The rail reflects the held-back state of a structurally invalid draft

Per `authoring-invariants`, duration checks do not run until the draft
passes Zod validation. CEL and registry checks do not run until the
draft also compiles. The checks rail SHALL show the CEL and registry
groups as held back whenever `validation.structurallyValid` is false.
It SHALL show the duration group as held back whenever
`validation.zodValid` is false. It SHALL NOT show a held-back group as
empty or passing.

The structural group's own held-back state does not follow from
`zodValid` alone. `compileProcessBody` (`src/schema/compile.ts`) runs
duration validation before the six structural checks, and raises on the
first duration issue without ever reaching them. A Zod-valid draft that
fails duration validation therefore never runs its structural checks
for that load, whatever `validation.zodValid` reports.

The checks rail SHALL show the structural group as held back whenever
structural checks did not run. That state has a name:
`validation.structuralChecked`. It is false when structural checks did
not run and true when they did. This holds even when the draft is
Zod-valid and the duration group shows its own, real issues.

#### Scenario: A Zod-invalid draft shows every group held back

- **WHEN** the loaded draft is not Zod-valid
- **THEN** the checks rail shows the structural, CEL, registry, and
  duration groups as held back, not as empty or passing

#### Scenario: A Zod-valid draft with a duration issue holds the structural group back too

- **WHEN** the loaded draft passes Zod validation but fails duration
  validation, so `compileProcessBody` raises before structural checks
  run (`validation.structuralChecked` is false)
- **THEN** the checks rail shows the duration group's actual issues
- **AND** the checks rail shows the structural, CEL, and registry groups
  as held back, not as empty or passing

#### Scenario: A Zod-valid, uncompilable draft holds back CEL and registry only

- **WHEN** the loaded draft passes Zod and duration validation but fails
  to compile
- **AND** that means a structural issue (`validation.structuralChecked`
  is true, `validation.structurallyValid` is false)
- **THEN** the checks rail shows the CEL and registry groups as held back
- **AND** it shows the structural and duration groups' actual issues

#### Scenario: A fully valid draft runs every group

- **WHEN** the loaded draft is Zod-valid and `validation.structurallyValid`
  is true
- **THEN** the checks rail shows each group's actual issues, or a clear
  pass state when a group has none

### Requirement: The rail adds a consolidated view; it does not replace per-entity issue placements

`IssueList` SHALL keep rendering its existing per-entity views. Those
views sit under the process header, on a step card, and on a path row.
They also sit in a field's validation editor. The checks rail is one more
consolidated
view over the same `validation.issues[]` array. It does not replace those
placements.

#### Scenario: An issue shows in both its entity placement and the rail

- **WHEN** a path guard carries a CEL issue
- **THEN** that issue shows in the path's own `IssueList` placement and
  in the checks rail's CEL group

### Requirement: Every publish blocker is visible in the rail with all groups clear

The checks rail SHALL show no unresolved issue in any group when the
draft passes every check publish requires. An author SHALL be able to
tell from the rail alone whether the draft is publishable.

#### Scenario: A fully clear draft shows no open issues

- **WHEN** the loaded draft passes every structural, CEL, registry, and
  duration check
- **THEN** the checks rail shows all groups clear, and no entry remains
  in any group

### Requirement: The rail lists in full on the panels screen

The panels screen SHALL show the rail's grouped list, in the third of
its three columns. The rail shows that same state on the canvas, when
the developer has selected nothing.

The rail SHALL NOT collapse to its one-line summary here. The collapse
rule exists because a selection takes the third column for an
inspector. The panels screen carries no selection and no inspector.

The rail SHALL report the same issues it reports on the canvas. Both
screens read one `validation.issues[]`, so a count on one and a count
on the other cannot disagree.

This placement is the reason the screen exists. An author on it edits
field keys and data source keys. Those two produce most of what the
rail reports, and a rail behind a backdrop reports to nobody.

#### Scenario: The panels screen shows the grouped list

- **WHEN** the developer opens the panels screen on a draft holding
  issues in two groups
- **THEN** the third column lists both groups, in full

#### Scenario: The rail does not collapse without a selection

- **WHEN** the developer opens the panels screen
- **THEN** the rail shows its grouped list, not its one-line summary

#### Scenario: A fix on the screen clears its own entry

- **WHEN** the developer corrects a field key the rail reports
- **THEN** that entry leaves the rail without a reload

#### Scenario: The two screens agree on the count

- **WHEN** the developer reads the rail on the panels screen, then
  returns to the canvas with nothing selected
- **THEN** both list the same entries
