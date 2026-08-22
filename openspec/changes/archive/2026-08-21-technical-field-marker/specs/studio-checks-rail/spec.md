## ADDED Requirements

### Requirement: The rail reports an unwritten technical field

A field declaring `technical: true` SHALL report where no structural
source writes it. The rail SHALL check the same four structural sources
the unwritable-requirement rule already reads. Each is an action's
`output`, a subprocess's `outputMapping`, a field's `columnMapping`, or a
`contract.inputFields` entry. This finding carries the `view` source. It
anchors on the field itself, not on any one step, since `technical` is a
catalog-level declaration.

A view entry SHALL NOT count as a structural source here. `technical`
forbids a `readonly` key on such an entry. Every step that places the
field visibly therefore reads as a writer. That holds under the presence
test the two existing view-flag findings use. The rule SHALL read
`writtenFieldCounts`' count instead, where a structural source adds
`Infinity` and a view entry adds one. It SHALL NOT read
`writtenFieldIds`, which collapses the two.

`FieldDef.default` SHALL NOT exempt a field. Nothing in the engine
applies a `default` to `instance.data` today. A technical field whose
only writer is a `default` therefore never holds a value. That is the
case this finding reports.

This finding is non-blocking. It never holds up a publish. The compile
pass's own rejection of a technical field's wired-editable view entry is
the publish-blocking half of this pair.

#### Scenario: An unwritten technical field reports

- **WHEN** a field declares `technical: true`
- **AND** no action output, subprocess output mapping, column mapping or
  contract input field targets it
- **THEN** the rail shows an entry under its `view` group, naming that
  field

#### Scenario: A placed technical field still reports

- **WHEN** a field declares `technical: true` and a step's view entry
  places it visibly
- **AND** no action output, subprocess output mapping, column mapping or
  contract input field targets it
- **THEN** the rail shows an entry under its `view` group, naming that
  field

#### Scenario: A default does not exempt an unwritten technical field

- **WHEN** a field declares `technical: true` and a `default`
- **AND** no action output, subprocess output mapping, column mapping or
  contract input field targets it
- **THEN** the rail shows an entry under its `view` group, naming that
  field

#### Scenario: A structurally written technical field raises nothing

- **WHEN** a field declares `technical: true`
- **AND** an `Action.output` map targets that field
- **THEN** the rail shows no entry for it

#### Scenario: A non-technical field never raises this finding

- **WHEN** a field declares no `technical` key and no structural source
  writes it
- **THEN** the rail shows no entry for it under this finding

## MODIFIED Requirements

### Requirement: The rail lists every open issue, grouped by source

The canvas edit screen SHALL show a checks rail in its third column, per
the `studio-canvas` capability's layout requirement. The rail SHALL list
every entry in the loaded draft's `validation.issues[]`. The rail SHALL
group entries by `source`: zod, structural, CEL, registry, duration, and
view.

The first five sources are engine validators. The studio runs each one
unmodified, and reports what it returns. The sixth holds the studio's own
findings, over a draft the engine would publish. It needs its own name for
that reason.

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
- **AND** the structural, CEL, registry, duration, and view groups show
  held back, not empty

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
and on nothing else. Its three rules read the Zod-parsed body directly,
which is the placement the duration group already takes. None of the
three needs a compiled body.

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
registry group's own, separately-shown held-back state SHALL NOT decide
whether the banner shows.

The reverse does not hold, and the rail SHALL NOT claim it. The view
group reports rather than blocks. Its three rules find a draft the engine
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
