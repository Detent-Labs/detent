## ADDED Requirements

### Requirement: The rail reports two view-flag stopping states

Two combinations of view flags stop a step, and the rail SHALL report
both. Each reads off `view.fields[]` alone. Each carries the `view`
source, and each anchors on the step that holds the view entry.

The first is a hidden requirement. A view entry with `visible` false and
`required` true drops the requirement without a word. `resolveFields`
removes the field before `requiredFieldIds` counts it. The rail SHALL
report that entry. It SHALL name the field.

The second is an unwritable requirement. Take a view entry with
`readonly` true and `required` true. Where nothing else writes the
field, every submission raises `required-missing`. `editableFieldIds`
excludes the field, so nobody can supply the value.

That second rule SHALL report only where five sources all leave the field
unwritten. No step's view makes it editable. No `Action.output`, no
`SubprocessSpec.outputMapping`, no `FieldDef.columnMapping` and no
`ProcessContract.inputFields` entry targets it. A calling parent seeds an
input field at spawn, outside any view. Real reachability over a cyclic
graph costs more than a warning earns. The rule therefore accepts a false
negative and SHALL raise no false positive.

Both rules read a literal flag alone. A flag holding a CEL expression
SHALL raise neither one. The engine resolves an expression against an
instance, and the studio holds none.

Neither rule SHALL read a view entry whose catalog field is a group
container. The engine resolves `required` and `readonly` to false for a
group. The editable set excludes one, and so does the required set. No
requirement exists there to drop or to strand.

#### Scenario: A hidden required field reports

- **WHEN** a step's view entry carries `visible: false` and
  `required: true`
- **THEN** the rail shows an entry under its `view` group, naming that
  field

#### Scenario: An unwritable required field reports

- **WHEN** a step's view entry carries `readonly: true` and
  `required: true`
- **AND** no step's view makes that field editable
- **AND** no action output, subprocess output mapping, column mapping or
  contract input field targets it
- **THEN** the rail shows an entry under its `view` group, naming that
  field

#### Scenario: A writable field raises nothing

- **WHEN** a step's view entry carries `readonly: true` and
  `required: true`
- **AND** an earlier step's view carries that field as editable
- **THEN** the rail shows no entry for it

#### Scenario: An action output counts as a writer

- **WHEN** a step's view entry carries `readonly: true` and
  `required: true`
- **AND** an `Action.output` map targets that field
- **THEN** the rail shows no entry for it

#### Scenario: A contract input field counts as a writer

- **WHEN** a step's view entry carries `readonly: true` and
  `required: true`
- **AND** this process's `contract.inputFields` names that field
- **THEN** the rail shows no entry for it

#### Scenario: A CEL flag raises neither rule

- **WHEN** a step's view entry carries `required: true` and a `visible`
  holding a CEL expression
- **THEN** the rail shows no entry for it

#### Scenario: A group container raises neither rule

- **WHEN** a step's view entry references a group-typed catalog field
  carrying `required: true`
- **THEN** the rail shows no entry for it, whatever `visible` and
  `readonly` hold

## MODIFIED Requirements

### Requirement: The rail lists every open issue, grouped by source

The canvas edit screen SHALL show a checks rail in its third column, per
the `studio-canvas` capability's layout requirement. The rail SHALL list
every entry in the loaded draft's `validation.issues[]`. The rail SHALL
group entries by `source`: zod, structural, CEL, registry, duration, and
view.

The first five sources are engine validators. The studio runs each one
unmodified, and reports what it returns. The sixth is the studio's own
finding, over a draft the engine would publish. It needs its own name for
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
- **THEN** the checks rail shows each group's actual issues, or a clear
  pass state when a group has none

### Requirement: Every publish blocker is visible in the rail with all groups clear

The checks rail SHALL show no unresolved issue in any group under two
conditions. The draft passes every check publish requires, and it
carries neither view-flag stopping state. An author SHALL be able to
tell from the rail alone that a clear draft is publishable.

The reverse does not hold, and the rail SHALL NOT claim it. The view
group reports rather than blocks. Its two rules find a draft the engine
publishes and an author did not mean. So an entry there leaves the draft
publishable.

The five engine groups keep their existing meaning. An entry in one of
those blocks a publish.

#### Scenario: A fully clear draft shows no open issues

- **WHEN** the loaded draft passes every structural, CEL, registry and
  duration check
- **AND** it carries neither view-flag stopping state
- **THEN** the checks rail shows all groups clear
- **AND** no entry remains in any group

#### Scenario: A view entry alone leaves the draft publishable

- **WHEN** the loaded draft passes every engine check, and carries one
  view-flag stopping state
- **THEN** the rail shows that entry under its `view` group
- **AND** the publish control stays available
