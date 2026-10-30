## ADDED Requirements

### Requirement: A draft with no step yet shows a start state

A draft whose step list is empty SHALL read as a start state. Its missing
first step SHALL NOT count as an open issue. The Checks count then reads 0.

With no other open issue, the rail SHALL show one sentence and no group.
That sentence names where to add the first step. The all-clear state SHALL
stay hidden. With some other open issue, the sentence SHALL stand first and
the groups SHALL follow.

#### Scenario: A fresh empty draft shows the start sentence alone

- **WHEN** an author opens the Checks tab on a draft the empty choice just
  seeded
- **THEN** the rail shows one sentence
- **AND** that sentence names the Canvas and the Steps tab as the places to
  add the first step
- **AND** it shows no group, held back or clear
- **AND** it does not show its all-clear state
- **AND** the Checks tab's count reads 0 in its ordinary color and weight

#### Scenario: The start state ends with the first step

- **WHEN** an author adds the first step to a draft in the start state
- **THEN** the start sentence leaves the rail
- **AND** the rail shows its groups under its other requirements

#### Scenario: Removing the last step returns the start state

- **WHEN** an author removes the only step of a draft
- **THEN** the rail shows the start sentence again

#### Scenario: Another open issue keeps its group beside the start sentence

- **WHEN** a draft with no step also carries an open Zod issue of another
  kind
- **THEN** the start sentence stands first
- **AND** that issue shows under the `zod` group, and the other groups read
  held back

#### Scenario: No line names the validator in the start state

- **WHEN** the rail or the header bar renders a draft in the start state
- **THEN** no text reads "zod" or "Invalid input"

### Requirement: An unnamed process reads one sentence at its name

A draft that holds a step but no base-locale name SHALL report that gap as
one open issue. The issue SHALL read as one sentence: the process needs a
name. The sentence SHALL name the field at the top of the page. It SHALL
stand in the header bar beside the name. There it SHALL print no source label. It
SHALL count as a blocker, and the rail SHALL list it in the `zod` group.

#### Scenario: A stepped, unnamed draft shows the name sentence

- **WHEN** a draft holds one named end step, and its own name is empty in
  the base locale
- **THEN** the header bar shows the sentence that the process needs a name
- **AND** no source label stands beside it there
- **AND** no text reads "missing baseLocale"

#### Scenario: The name sentence counts as a blocker

- **WHEN** a draft holds one named end step, and its own name is empty in
  the base locale
- **THEN** the Checks tab's count reads 1 and carries the blocker color
- **AND** the rail lists the same sentence in its `zod` group

#### Scenario: Typing a name clears the sentence

- **WHEN** an author types a name into the header bar's name field
- **THEN** the sentence leaves the header bar and the rail

## MODIFIED Requirements

### Requirement: The rail lists every open issue, grouped by source

The Checks tab SHALL carry the full grouped rail, per the
`studio-process-tabs` capability's tab-row requirement. The rail SHALL list
every entry in the loaded draft's `validation.issues[]`. The rail SHALL group
entries by `source`: zod, structural, CEL, registry, duration, and view.

A draft with no step yet holds one Zod issue that is not an entry: the
missing first step. This capability's start-state requirement covers that
draft.

The first five sources are engine validators. The studio runs each one
unmodified, and reports what it returns. The sixth holds the studio's own
findings, over a draft the engine would publish. It needs its own name for
that reason.

The Checks tab is the one place the full grouped rail stands. It stands there
whatever the author has selected. No column beside another tab stands it. A
row in the rail opens the tab that owns its subject, per the
`studio-process-tabs` capability.

#### Scenario: A structural issue appears in its group

- **WHEN** the loaded draft has a structural issue on some step
- **THEN** the Checks tab prints that issue under a structural group

<!-- The heading repeats the live spec's wording verbatim, so a delta can match it. -->
<!-- antislop: allow synonym-rotation -->
#### Scenario: Issues across sources each show in their own group

- **WHEN** the loaded draft has a structural issue and a CEL issue
- **THEN** the Checks tab prints one group for each source, each holding its
  own issue

#### Scenario: A Zod-invalid draft's issues show in their own group

- **WHEN** the loaded draft fails Zod validation (`zodValid` is false)
- **AND** it holds at least one step
- **THEN** the Checks tab prints those issues under a `zod` group
<!-- antislop: allow trailing-negation -->
<!-- Copied from the live spec; held back and empty are the two states the scenario contrasts. -->
- **AND** the structural, CEL, registry, duration, and view groups read held
  back, not empty

### Requirement: The rail reflects the held-back state of a structurally invalid draft

<!-- antislop: allow sentence-length -->
<!-- Copied from the live spec; a sentence opening on a code span merges with its neighbour in the count. -->
`validateStructure` (`src/validate.ts`) reports the duration and structural
dimensions as not run when the Zod parse fails and the compile pass raised
no duration or structural issue. CEL and registry checks do not run until the
draft compiles. The field `dimensions.structural` reads `"ran"`
both when the structural checks pass cleanly and when they run and
raise a structural issue. That field alone cannot tell the two states
apart.

This requirement governs a draft that holds at least one step. It also
governs a draft with no step that carries some other open issue. A draft
with no step and no other open issue shows the start state alone. This
capability's start-state requirement covers it.

The checks rail SHALL show the CEL and registry groups as held back
whenever the structural dimension did not run. It SHALL also show them
held back whenever the structural group's own issue list is non-empty.
It SHALL show the duration group as held back whenever
`validation.zodValid` is false. It SHALL NOT show a held-back group as
empty or passing.

The registry group covers three checks. Those checks read the action
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

The studio has no live registry schema, so it cannot validate a plugin
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
duration validation before the structural checks, and raises on the
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
- **AND** it holds at least one step
- **AND** the compile pass raised no structural issue
- **THEN** the checks rail shows the structural, CEL, registry, duration
  and view groups as held back
- **AND** it shows none of them as empty or passing

#### Scenario: A Zod-invalid draft with a structural issue shows that issue

- **WHEN** the loaded draft is not Zod-valid
- **AND** the compile pass raised a structural issue
- **THEN** the checks rail shows the structural group's actual issues
- **AND** it shows the CEL, registry, duration and view groups as held back

#### Scenario: A Zod-valid draft with a duration issue holds the structural group back too

- **WHEN** the loaded draft passes Zod validation but fails duration
  validation, so `compileProcessBody` raises before structural checks
  run
- **THEN** the checks rail shows the duration group's actual issues
- **AND** the checks rail shows the structural, CEL, and registry groups
  as held back
- **AND** it shows none of those three as empty or passing
- **AND** the view group runs, since it does not need a compiled body

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
- **AND** the CEL group's own issue list has no entry for that site
- **AND** the group never presents that site as a clear pass
- **AND** a visible control beside that action shows the not-checked state
