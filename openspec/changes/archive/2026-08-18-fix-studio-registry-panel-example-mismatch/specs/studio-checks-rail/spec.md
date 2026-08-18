## MODIFIED Requirements

### Requirement: The rail reflects the held-back state of a structurally invalid draft

Per `authoring-invariants`, duration checks do not run until the draft
passes Zod validation. CEL and registry checks do not run until the
draft also compiles. The checks rail SHALL show the CEL and registry
groups as held back whenever `validation.structurallyValid` is false.
It SHALL show the duration group as held back whenever
`validation.zodValid` is false. It SHALL NOT show a held-back group as
empty or passing.

The registry group SHALL also show held back whenever the studio holds no
live `Registry`, independent of `structurallyValid`. No part of this
deployment ever loads one. The registry group therefore stays held back in
every draft state the studio can reach.

A held-back registry group is not itself an issue. The check itself,
`checkActionRegistry`, still runs at publish time on the server, and
still blocks a publish there. The rail's registry group only reports
whether that check ran in the browser during this session. It never
does.

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

The view group SHALL hold back whenever `validation.zodValid` is false,
and on nothing else. Its two rules read the Zod-parsed body directly,
which is the placement the duration group already takes. Neither rule
needs a compiled body.

#### Scenario: A Zod-invalid draft shows every group held back

- **WHEN** the loaded draft is not Zod-valid
- **THEN** the checks rail shows the structural, CEL, registry, duration
  and view groups as held back
- **AND** it shows none of them as empty or passing

#### Scenario: A Zod-valid draft with a duration issue holds the structural group back too

- **WHEN** the loaded draft passes Zod validation but fails duration
  validation, so `compileProcessBody` raises before structural checks
  run (`validation.structuralChecked` is false)
- **THEN** the checks rail shows the duration group's actual issues
- **AND** the checks rail shows the structural, CEL, and registry groups
  as held back, not as empty or passing
- **AND** the view group runs, since it needs no compiled body

#### Scenario: A Zod-valid, uncompilable draft holds back CEL and registry only

- **WHEN** the loaded draft passes Zod and duration validation but fails
  to compile
- **AND** that means a structural issue (`validation.structuralChecked`
  is true, `validation.structurallyValid` is false)
- **THEN** the checks rail shows the CEL and registry groups as held back
- **AND** it shows the structural, duration, and view groups' actual
  issues

#### Scenario: A fully valid draft runs every group

- **WHEN** the loaded draft is Zod-valid and `validation.structurallyValid`
  is true
- **THEN** the checks rail shows each of the zod, structural, CEL,
  duration, and view groups' actual issues
- **AND** any of those five groups with no issues shows a clear pass state
  instead
- **AND** the registry group still shows held back, since the studio never
  loads a live `Registry`

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

The summary SHALL show a single count. That count is the total number of
open entries across the zod, structural, CEL, duration, and view groups
in `validation.issues[]`. The registry group's own state SHALL NOT enter
that count, and SHALL NOT change whether the summary reads clear. The
registry group stays held back in every draft state this deployment
reaches, per the held-back requirement above. Counting it, or gating on
it, would leave the summary unable to read clear on any draft.

Any of the zod, structural, CEL, duration, or view groups can hold back.
When one does, the summary SHALL show a held-back indicator instead. That
indicator SHALL differ from both a count and "no count." A held-back
group has not run its checks yet; it is not clear.

The summary SHALL NOT read as clear or passing while one of those five
groups holds back. This carries the rail's own held-back requirement into
its collapsed form. The registry group's own held-back state SHALL NOT,
by itself, put the summary into this state.

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

- **WHEN** the loaded draft passes every zod, structural, CEL, duration,
  and view check
- **THEN** the collapsed summary shows no count
- **AND** it does not show a held-back indicator, even though the
  registry group itself stays held back

#### Scenario: A structurally invalid draft's summary shows held back, not clear

- **WHEN** the loaded draft is not Zod-valid, so every one of those five
  groups holds back
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

### Requirement: Every publish blocker is visible in the rail with all groups clear

The checks rail SHALL show no unresolved issue in the zod, structural,
CEL, duration, and view groups under two conditions. The draft passes
every check publish requires, and it carries neither view-flag stopping
state. An author SHALL be able to tell from those five groups alone that
a clear draft is publishable.

The registry group is the one exception. It SHALL stay held back in
every draft state in this deployment, per the held-back requirement
above. A held-back registry group SHALL NOT read as a publish blocker.
The server enforces the registry-resolution check at publish time. It
does so regardless of the rail's own state.

The rail's own "all clear" banner reads the same way, under the same two
conditions. The zod, structural, CEL, duration, and view groups carry no
open issue. The draft carries neither view-flag stopping state. The
registry group's own, separately-shown held-back state SHALL NOT change
whether the banner shows.

The reverse does not hold, and the rail SHALL NOT claim it. The view
group reports rather than blocks. Its two rules find a draft the engine
publishes and an author did not mean. So an entry there leaves the draft
publishable.

The five engine groups keep their existing meaning. An entry in one of
those blocks a publish.

#### Scenario: A fully clear draft shows no open issues

- **WHEN** the loaded draft passes every zod, structural, CEL, and
  duration check
- **AND** it carries neither view-flag stopping state
- **THEN** the checks rail shows the zod, structural, CEL, duration, and
  view groups clear
- **AND** no entry remains in any of those five groups
- **AND** the registry group shows held back, not clear and not failing
- **AND** the rail shows its "all clear" banner, unaffected by the
  registry group's held-back state

#### Scenario: A held-back registry group does not block publish

- **WHEN** the checks rail shows the registry group held back and every
  other group clear
- **THEN** the publish control stays available
- **AND** the server's own `checkActionRegistry` run at publish time
  stays the actual gate on the registry dimension

#### Scenario: A view entry alone leaves the draft publishable

- **WHEN** the loaded draft passes every engine check, and carries one
  view-flag stopping state
- **THEN** the rail shows that entry under its `view` group
- **AND** the publish control stays available
