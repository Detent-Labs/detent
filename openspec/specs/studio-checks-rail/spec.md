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

The summary SHALL show a single count. That count totals every open entry in
`validation.issues[]`. It spans the zod, structural, CEL, registry, duration,
and view groups. A registry type-resolution issue counts toward that total.
The registry group's config-validation half stays held back in every draft
state this deployment reaches, per the held-back requirement above. That
held-back half alone SHALL NOT enter the count, and SHALL NOT decide whether
the summary reads clear.

Any of the zod, structural, CEL, registry, duration, or view groups can hold
back. That happens for want of a compiled body. When one does, the summary
SHALL show a held-back indicator instead. That indicator SHALL differ from
both a count and "no count." A held-back group has not run its checks yet; it
is not clear.

The summary SHALL NOT read as clear or passing while one of those six groups
holds back. That holding-back is for want of a compiled body. This carries
the rail's own held-back requirement into its collapsed form. The registry
group's config-validation half can hold back on its own. When it does, with
the group's type-resolution half clear, the summary SHALL NOT enter this
state.

Choosing the summary SHALL expand it to the same grouped list the full
rail shows when the developer selects nothing.

#### Scenario: Selecting a step collapses the rail to a summary

- **WHEN** the developer selects a step
- **THEN** the third column shows the inspector, and a one-line checks
  summary docks at its bottom edge

#### Scenario: The summary counts every open issue

- **WHEN** the loaded draft carries three open issues across two groups
- **THEN** the collapsed summary shows a count of three

#### Scenario: A registry type-resolution issue enters the collapsed count

- **WHEN** the loaded draft compiles, and names an action type the registry
  response does not hold
- **THEN** the collapsed summary's count includes that registry issue
- **AND** the registry group's own config-validation half stays held back
  without changing that count

#### Scenario: A fully clear draft's summary carries no count

- **WHEN** the loaded draft passes every zod, structural, CEL, registry,
  duration, and view check
- **THEN** the collapsed summary shows no count
- **AND** it does not show a held-back indicator, even though the
  registry group's config-validation half stays held back

#### Scenario: A structurally invalid draft's summary shows held back, not clear

- **WHEN** the loaded draft is not Zod-valid, so every one of those six
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

### Requirement: The rail reflects the held-back state of a structurally invalid draft

Per `authoring-invariants`, duration checks do not run until the draft
passes Zod validation. CEL and registry checks do not run until the
draft also compiles. The field `dimensions.structural` reads `"ran"`
both when the six structural checks pass cleanly and when they run and
raise a structural issue. That field alone cannot tell the two states
apart.

The checks rail SHALL show the CEL and registry groups as held back
whenever the structural dimension did not run. It SHALL also show them
held back whenever the structural group's own issue list is non-empty.
It SHALL show the duration group as held back whenever
`validation.zodValid` is false. It SHALL NOT show a held-back group as
empty or passing.

The registry group covers three checks, not one. Those checks read the action
types, the assignment strategy types and the data source types a body names.
Each check splits into a type-resolution half and a config-validation half.

The studio holds the registry type names once `useRegistry` has resolved
them. It reads them from the same registry response the plugin-config form
already reads. The registry group's type-resolution half SHALL therefore run
whenever the draft compiles and that response has resolved. It SHALL NOT
hold back for want of a registry once the response has resolved.

While `useRegistry` has not resolved a registry description for this
session, the type-resolution half SHALL read as held back. That covers both
states `useRegistry` collapses into one `undefined` result: still loading,
and resolved to nothing after a failed fetch. That held-back state is
distinct from the config-validation half's own held-back state below. It
clears once the fetch resolves for the session. The config-validation
half's held-back state does not clear.

The studio holds no live registry schema, so it cannot validate a plugin
config. The registry group SHALL report its config-validation half as held
back in every draft state the studio can reach. A held-back config-validation
half is not itself an issue. That check still runs at publish time on the
server, and still blocks a publish there.

The CEL group covers process chaining targets alongside subprocess child
references. Both need a loaded target body. A chaining site whose target body
the studio has not loaded reads the same way an unloaded subprocess child
reads. The rail SHALL report it as not checked, per site, and never as
passing.

`ValidationResult` SHALL carry that per-site state in a dedicated field,
`chainingSiteStatus`. It carries that field the same way it already carries
`subprocessStepStatus` for the analogous subprocess case. A visible control
next to the `process.start` action itself SHALL show that state. That is the
same way the subprocess step's own fieldset already shows an unloaded child.

The structural group's own held-back state does not follow from
`zodValid` alone. `compileProcessBody` (`src/schema/compile.ts`) runs
duration validation before the six structural checks, and raises on the
first duration issue without ever reaching them. A Zod-valid draft that
fails duration validation therefore never runs its structural checks
for that load, whatever `validation.zodValid` reports.

The checks rail SHALL show the structural group as held back whenever
structural checks did not run. The rail holds that group back when the
structural checks did not run, and runs it when they did. This holds even when
the draft is Zod-valid and the duration group shows its own, real issues.

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
  run
- **THEN** the checks rail shows the duration group's actual issues
- **AND** the checks rail shows the structural, CEL, and registry groups
  as held back, not as empty or passing
- **AND** the view group runs, since it needs no compiled body

#### Scenario: A Zod-valid, uncompilable draft holds back CEL and registry only

- **WHEN** the loaded draft passes Zod and duration validation but fails
  to compile
- **AND** that means a structural issue
- **THEN** the checks rail shows the CEL and registry groups as held back
- **AND** it shows the structural, duration, and view groups' actual
  issues

#### Scenario: A compiling draft resolves plugin types in all three registries

- **WHEN** the loaded draft compiles
- **AND** it names an action type, an assignment strategy type and a data
  source type
- **AND** the registry response holds none of those three
- **THEN** the checks rail shows one registry issue for each of the three
- **AND** the registry group does not show as held back for type resolution

#### Scenario: The type-resolution half holds back while the registry description has not resolved

- **WHEN** the loaded draft compiles
- **AND** `useRegistry` has not yet resolved a registry description for this
  session, whether still loading or after a failed fetch
- **THEN** the checks rail shows the registry group's type-resolution half as
  held back
- **AND** that state reads independently of `registryConfigHeldBack`, which
  stays `true` regardless

#### Scenario: A fully valid draft runs every group

- **WHEN** the loaded draft is Zod-valid and the structural dimension ran
  with no issue
- **THEN** the checks rail shows each of the zod, structural, CEL,
  duration, registry and view groups' actual issues
- **AND** any of those six groups with no issues shows a clear pass state
  instead
- **AND** the registry group still reports its config-validation half as
  held back
- **AND** the structural group still reports its unknown-key check as held
  back

#### Scenario: A chaining site with no loaded target reads as not checked

- **WHEN** the loaded draft compiles, and carries a `process.start` action
- **AND** the studio has not loaded that action's target process body
- **THEN** `chainingSiteStatus` reports that action's site as not checked
- **AND** the CEL group's own issue list carries no entry for that site
- **AND** the group never presents that site as a clear pass
- **AND** a visible control beside that action shows the not-checked state

### Requirement: The rail adds a consolidated view; it does not replace per-entity issue placements

`IssueList` SHALL keep rendering its existing per-entity views. Those
views sit under the process header, on a step card, and on a path row.
They also sit on the panels screen's Fields view, above the field
editor's tab set. The checks rail is one more consolidated view over
the same `validation.issues[]` array. It does not replace those
placements.

A field's own `IssueList` SHALL sit above the tab set rather than
inside one tab. The field's validation rules sit on the Rules tab.
Inside that tab, an issue would hide whenever the author opened
another one.

#### Scenario: An issue shows in both its entity placement and the rail

- **WHEN** a path guard carries a CEL issue
- **THEN** that issue shows in the path's own `IssueList` placement and
  in the checks rail's CEL group

#### Scenario: A field's issue stays visible on every tab

- **WHEN** a field carries a validation issue and the developer opens
  the Values tab
- **THEN** that field's `IssueList` still shows the issue above the tab
  set

### Requirement: Every publish blocker is visible in the rail with all groups clear

The rail organizes issues into six groups: zod, structural, CEL, registry,
duration and view. The first five carry the engine's verdict; view is the
studio's own, non-blocking finding. The checks rail SHALL show no
unresolved issue in those six under two conditions. The draft passes every check publish requires. It carries neither view-flag stopping
state. An author SHALL be able to tell from those six groups alone that a clear draft is
publishable.

Two checks stay outside what the rail can prove. The first is plugin config
validation, which needs a live registry schema the browser does not hold. The
second is the unknown-key check, which needs the raw authored body. The studio
validates a body the Zod parse has already stripped. The rail SHALL show each
of those two as held back rather than clear. A held-back check SHALL NOT
read as a publish blocker, and SHALL NOT stop the "all clear" banner.

The server enforces both of those checks at publish time. It does so
regardless of the rail's own state.

A third gap stays outside every group the rail shows, held-back or not.
That gap is subprocess wiring. The check `checkSubprocessChildRefs`
compares only a loaded subprocess child's automatic-path guards and
`outputMapping` values against that child's declared outputs. It never
checks `inputMapping` key validity against the child's declared inputs.

It never checks whether a subprocess step's child reference resolves to
a contracted child at all. Those checks belong to
`cross-process-validation`, not to this rail. No rail group runs them,
now or in an earlier version of this rail.

A clear rail predicts a clean publish only for the checks it runs. Those
are registry type resolution and a `process.start` action's
chaining-target field mapping. It predicts nothing about a subprocess
step's `inputMapping` or its child's resolvability.

The rail's own "all clear" banner reads the same way, under the same two
conditions. The zod, structural, CEL, registry, duration, and view groups carry
no open issue. The draft carries neither view-flag stopping state. A
separately-shown held-back check SHALL NOT decide whether the banner shows.

The reverse does not hold, and the rail SHALL NOT claim it. The view
group reports rather than blocks. Its three rules find a draft the engine
publishes and an author did not mean. So an entry there leaves the draft
publishable.

The five engine groups keep their existing meaning. An entry in one of
those blocks a publish.

#### Scenario: A fully clear draft shows no open issues

- **WHEN** the loaded draft passes every zod, structural, CEL, registry and
  duration check
- **AND** it carries neither view-flag stopping state
- **THEN** the checks rail shows the zod, structural, CEL, registry, duration
  and view groups clear
- **AND** no entry remains in any of those six groups
- **AND** the rail shows its "all clear" banner

#### Scenario: A clear rail predicts a clean publish

- **WHEN** the checks rail shows every group clear for a draft
- **AND** every one of that draft's `process.start` actions has a
  `chainingSiteStatus` of `"checked"`, so none reads not-checked
- **AND** that draft names only registered plugin types, and maps its
  `process.start` actions only into fields the target process declares
- **THEN** publishing that draft reports no registry or chaining issue
- **AND** this scenario claims nothing about a subprocess step's
  `inputMapping` or its child's resolvability

#### Scenario: A chaining issue reaches the rail

- **WHEN** the loaded draft carries a `process.start` action that maps into a
  field its target process does not declare
- **AND** the studio has loaded that target process's body
- **THEN** the checks rail shows one CEL group entry naming that field
- **AND** the entry anchors on the action's own site

#### Scenario: A held-back registry group does not block publish

- **WHEN** the checks rail shows the registry group's config-validation half
  held back
- **AND** every group reads clear
- **THEN** the publish control stays available
- **AND** the server's own config validation at publish time stays the actual
  gate on that dimension

#### Scenario: A held-back structural group's unknown-key check does not block publish

- **WHEN** the checks rail shows `CheckGroup.unknownKeysHeldBack` on the
  structural group
- **AND** every group reads clear
- **THEN** the publish control stays available
- **AND** the server's own unknown-key check at publish time stays the actual
  gate on that dimension

#### Scenario: A view entry alone leaves the draft publishable

- **WHEN** the loaded draft passes every engine check, and carries one
  view-flag stopping state
- **THEN** the rail shows that entry under its `view` group
- **AND** the publish control stays available

### Requirement: The rail reports two view-flag stopping states

Two combinations of view flags stop a step, and the rail SHALL report
both. Each reads off `view.fields[]` alone. Each carries the `view`
source, and each anchors on the step that holds the view entry.

Both states SHALL read field entries alone. A note carries no `required`
and no `readonly`, so neither state can describe one. The rail SHALL skip
a note rather than report it. Each state names the field it found, and a
note names no field.

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

#### Scenario: A note draws no view-flag finding

- **WHEN** a step's view carries a note whose `visible` is false
- **THEN** the rail reports no hidden-requirement finding for that entry

#### Scenario: A field entry beside a note still draws its finding

- **WHEN** a step's view carries a note and a field entry with `visible` false
  and `required` true
- **THEN** the rail reports the hidden requirement, and names that field

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

### Requirement: The checks rail renders from compiled styles

`panels/ChecksRail.tsx` SHALL render from compiled component styles,
reading `form-ui/tokens.stylex`. The rendered result SHALL match the
previous stylesheet declaration for declaration. That covers its
collapsed one-line summary state and its full, grouped-by-source state.

#### Scenario: The checks rail keeps its look in both states

- **WHEN** a browser renders the checks rail collapsed and expanded
- **THEN** each state's computed layout, spacing, color and border
  equal the values the deleted stylesheet declared
