## MODIFIED Requirements

### Requirement: The rail reflects the held-back state of a structurally invalid draft

Per `authoring-invariants`, duration checks do not run until the draft
passes Zod validation. CEL and registry checks do not run until the
draft also compiles. The checks rail SHALL show the CEL and registry
groups as held back whenever `validation.structurallyValid` is false.
It SHALL show the duration group as held back whenever
`validation.zodValid` is false. It SHALL NOT show a held-back group as
empty or passing.

The registry group covers three checks, not one. Those checks read the action
types, the assignment strategy types and the data source types a body names.
Each check splits into a type-resolution half and a config-validation half.

The studio holds the registry type names. It reads them from the same
registry response the plugin-config form already reads. The registry group's
type-resolution half SHALL therefore run whenever the draft compiles. It SHALL
NOT hold back for want of a registry.

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

#### Scenario: A fully valid draft runs every group

- **WHEN** the loaded draft is Zod-valid and `validation.structurallyValid`
  is true
- **THEN** the checks rail shows each of the zod, structural, CEL,
  duration, registry and view groups' actual issues
- **AND** any of those six groups with no issues shows a clear pass state
  instead
- **AND** the registry group still reports its config-validation half as
  held back

### Requirement: Every publish blocker is visible in the rail with all groups clear

Six groups carry the engine's verdict: zod, structural, CEL, registry,
duration and view. The checks rail SHALL show no unresolved issue in those six
under two conditions. The draft passes every check publish requires. It carries neither view-flag stopping state. An
author SHALL be able to tell from those six groups alone that a clear draft is
publishable.

Two checks stay outside what the rail can prove. The first is plugin config
validation, which needs a live registry schema the browser does not hold. The
second is the unknown-key check, which needs the raw authored body. The studio
validates a body the Zod parse has already stripped. The rail SHALL show each
of those two as held back rather than clear. A held-back check SHALL NOT
read as a publish blocker, and SHALL NOT stop the "all clear" banner.

The server enforces both of those checks at publish time. It does so
regardless of the rail's own state.

The rail's own "all clear" banner reads the same way, under the same two
conditions. The zod, structural, CEL, registry, duration, and view groups carry
no open issue. The draft carries neither view-flag stopping state. A
separately-shown held-back check SHALL NOT decide whether the banner shows.

The reverse does not hold, and the rail SHALL NOT claim it. The view
group reports rather than blocks. Its two rules find a draft the engine
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
- **AND** that draft names only registered plugin types, and maps its
  `process.start` actions only into fields the target process declares
- **THEN** publishing that draft reports no registry, chaining or
  cross-process issue

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

#### Scenario: A view entry alone leaves the draft publishable

- **WHEN** the loaded draft passes every engine check, and carries one
  view-flag stopping state
- **THEN** the rail shows that entry under its `view` group
- **AND** the publish control stays available
