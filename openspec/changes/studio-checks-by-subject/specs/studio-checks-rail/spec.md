# Spec Delta

## ADDED Requirements

### Requirement: The Checks tab lists every open issue by subject

The Checks tab SHALL carry the full list. It SHALL hold one row per open issue.
Three subjects SHALL hold the rows, in this order. They read Steps, Fields and
Before publishing.

Steps and Fields SHALL draw nothing with no row. Before publishing SHALL draw
while it holds a row or the line. A narrowed list SHALL keep it too. The start
state alone SHALL draw neither. No source name SHALL print outside a
Developer view.

#### Scenario: Issues from two sources share a subject

- **WHEN** one step carries a structural issue and a CEL issue
- **THEN** the Checks tab prints both rows under Steps
- **AND** no heading names a source

#### Scenario: A subject with no row draws nothing

- **WHEN** no open issue belongs to Fields
- **THEN** the Checks tab prints no Fields heading

#### Scenario: A clear draft draws Before publishing with the line alone

- **WHEN** the loaded draft passes every check
- **THEN** Before publishing stands with the line and no row

### Requirement: Each subject holds the issues of its kind

Steps SHALL hold an issue on a step, a way out, a time limit or an action. It
SHALL also hold a process-level issue located under `workflow`. Fields SHALL
hold an issue on a field or a data source. It SHALL also hold a process-level
issue located under `fields` or `dataSources`. Before publishing SHALL hold
every other issue. Inside Steps, rows SHALL follow the draft's step order.

#### Scenario: A step's issue stands under Steps

- **WHEN** the loaded draft has a structural issue on some step
- **THEN** the Checks tab prints its row under Steps

#### Scenario: A field's issue stands under Fields

- **WHEN** a field and a data source each carry an issue
- **THEN** the Checks tab prints both rows under Fields

#### Scenario: A contract's issue stands under Before publishing

- **WHEN** the contract carries an issue
- **THEN** the Checks tab prints its row under Before publishing

#### Scenario: Rows follow the step order

- **WHEN** the second and the first step each carry an issue
- **THEN** the first step's row stands above the second step's

### Requirement: A row states its severity in a word

Each row SHALL print one severity word above its sentence. An issue from the
studio's own `view` findings SHALL read Worth a look, in slate. Every other
issue SHALL read Must fix, in the refusal tone. The word SHALL follow the same
rule as the Checks count's blocker state.

#### Scenario: An engine issue reads Must fix

- **WHEN** a row holds an issue from an engine validator
- **THEN** the row reads Must fix

#### Scenario: A view finding reads Worth a look

- **WHEN** a row holds a view-flag finding
- **THEN** the row reads Worth a look

### Requirement: Every engine message reads as one sentence

Every open issue SHALL read as one sentence for a person, from one module. The
sentence for a step's issue SHALL name the step, and the section where one owns
the issue. The sentence for a field or a data source SHALL name that field or
source. It SHALL say what to do.

It SHALL print no key's or id's value, no CEL, no validator name and no JSON
property. A data source's key counts as its name. Each issue SHALL keep the raw
message beside its sentence.

#### Scenario: A way out with no name reads a sentence

- **WHEN** a way out's label is empty on the step "Review"
- **THEN** the row says a way out of "Review" has no name, and names Ways out
- **AND** no text reads "Invalid input"

#### Scenario: A step with no name reads a sentence

- **WHEN** a step's label has no base-locale entry
- **THEN** the sentence says the step needs a name
- **AND** no text reads "missing baseLocale"

#### Scenario: A guard the parser rejects reads a sentence

- **WHEN** a guard fails to parse
- **THEN** the sentence names the way out, the step and Ways out
- **AND** no text repeats the parser's message

#### Scenario: Two unnamed steps read their numbers

- **WHEN** two unnamed steps each carry an issue
- **THEN** one sentence reads "(unnamed step 2)" and the other "(unnamed step 3)"

### Requirement: A message no rule knows still names its place

A message no rule knows SHALL read as a sentence naming its place. That sentence
SHALL send the reader to the check's Developer view. A sentence SHALL NOT name a
section the step's kind leaves out.

#### Scenario: An unknown message on a step names the section

- **WHEN** a location on a step carries a message no rule knows
- **THEN** the sentence names that step and that section
- **AND** it sends the reader to the check's Developer view on the Checks tab

#### Scenario: A section the kind leaves out is not named

- **WHEN** an end step carries a check on a time limit
- **THEN** the sentence names the step
- **AND** it names no section

### Requirement: A scan keeps the sentences complete

Each message literal of the body's validators SHALL meet a rule of its own. A
test SHALL scan those literals in `src/schema/definition.ts`,
`src/schema/compile.ts` and `src/engine/registry-check.ts`.

#### Scenario: A new engine literal without a rule fails the suite

- **WHEN** a validator gains a message literal no rule meets
- **THEN** the scan test fails, naming that literal

### Requirement: A row's Developer view holds the check kind

Each row SHALL carry a closed Developer view. It SHALL hold the issue's source,
its raw message and its location, in the mono face. Nothing else on the Checks
tab SHALL print them.

#### Scenario: The kind waits behind the Developer view

- **WHEN** an author reads a row with its Developer view closed
- **THEN** no source name or raw message shows
- **AND** the open Developer view holds the source, the raw message and the
  location

### Requirement: What has not run reads as one line under Before publishing

The rail SHALL say what has not run in one line under Before publishing. While
any check holds back, the line SHALL say that more checks run once the author
fixes the rows above. It SHALL also say what publishing checks on its own. It
SHALL say that second part alone when nothing holds back. A closed Developer
view on the line SHALL list the held-back kinds.

#### Scenario: A Zod-invalid draft holds its other checks back

- **WHEN** the loaded draft is not Zod-valid
- **AND** it holds at least one step
- **THEN** the line says more checks run after the rows above
- **AND** the line's Developer view names structural, CEL, registry, duration
  and view
- **AND** the rail does not state all clear

#### Scenario: A clear draft shows the second part alone

- **WHEN** the loaded draft passes every check
- **THEN** the rail states all clear
- **AND** the line says what publishing checks, and no more

### Requirement: The held-back reading follows what ran

The source `zod` SHALL never hold back.

The source `structural` SHALL hold back when the structural checks did not run.

The sources `cel` and `registry` SHALL hold back when those checks did not run
or raised an issue. The source `registry` SHALL also hold back until
`useRegistry` resolves a description.

The sources `duration` and `view` SHALL hold back when `validation.zodValid` is
false, and on nothing else.

#### Scenario: A duration issue holds structural back and leaves view running

- **WHEN** the loaded draft passes Zod validation but fails duration validation
- **THEN** the line's Developer view names structural, CEL and registry
- **AND** it does not name view

#### Scenario: A structural issue holds CEL and registry back

- **WHEN** the loaded draft passes Zod and duration validation but fails to
  compile
- **THEN** the line's Developer view names CEL and registry

#### Scenario: An unresolved registry holds the type check back

- **WHEN** the loaded draft compiles
- **AND** `useRegistry` has not resolved a registry description, whether still
  loading or after a failed fetch
- **THEN** the line's Developer view names registry

#### Scenario: Unknown plugin types raise rows in all three registries

- **WHEN** the loaded draft compiles
- **AND** it names an action type, an assignment strategy type and a source
  type
- **AND** the registry response holds none of the three
- **THEN** the rail shows one Must fix row for each of the three

### Requirement: A chaining site with no loaded target reads as not checked

A chaining site SHALL read as not checked while the studio lacks its target body.
It SHALL read so per site, and never as passing. The type `ValidationResult`
SHALL carry that state in `chainingSiteStatus`, beside `subprocessStepStatus`. A
visible control beside the `process.start` action SHALL show that state.

#### Scenario: An unloaded target shows at its action

- **WHEN** the loaded draft compiles, and carries a `process.start` action
- **AND** the studio has not loaded that action's target process body
- **THEN** `chainingSiteStatus` reports that action's site as not checked
- **AND** the list has no row for that site
- **AND** a visible control beside that action shows the not-checked state

### Requirement: Publishing keeps two checks the studio cannot run

The studio has no live plugin schema, and it validates a body the Zod parse has
stripped. Plugin config validation and the unknown-key check SHALL therefore
read as what publishing checks. Neither SHALL read as a publish blocker. Neither
SHALL stop the all-clear state. The server SHALL enforce both at publish time.

#### Scenario: A held-back plugin check does not block publish

- **WHEN** the rail shows its all-clear state
- **THEN** the publish control stays available
- **AND** the server's config and unknown-key checks stay the actual gate

### Requirement: The all-clear state stands only with no open issue

The rail's all-clear state SHALL stand under two conditions. No row stands, and
no check holds back. A view-flag finding SHALL keep it hidden. A Worth a look row
SHALL leave the draft publishable, so the publish control stays available. A Must
fix row SHALL block a publish.

#### Scenario: A fully clear draft shows no row

- **WHEN** the loaded draft passes every check and has no view-flag finding
- **THEN** the rail prints no row
- **AND** the rail shows its all-clear state

#### Scenario: A view finding alone leaves the draft publishable

- **WHEN** the loaded draft passes every engine check, and carries one
  view-flag finding
- **THEN** the rail shows that row as Worth a look
- **AND** the publish control stays available

### Requirement: A clear rail predicts only the checks it runs

A clear rail SHALL predict a clean publish only for registry type resolution and
a `process.start` action's chaining-target field mapping. It SHALL predict
nothing about a subprocess step's `inputMapping` or its child's resolvability,
which `cross-process-validation` owns.

#### Scenario: A clear rail predicts a clean publish

- **WHEN** the rail shows its all-clear state
- **AND** every `process.start` action reads `"checked"` in `chainingSiteStatus`
- **AND** the draft names only registered plugin types, and maps its
  `process.start` actions only into fields the target process declares
- **THEN** publishing that draft reports no registry or chaining issue

#### Scenario: A chaining issue reaches the rail

- **WHEN** a `process.start` action maps into a field its loaded target process
  does not declare
- **THEN** the rail shows one Must fix row
- **AND** its Fix control lands on the section holding that action

### Requirement: A check prints its sentence at every placement

Every placement SHALL print the issue's sentence with no source label. That
covers the step page, the field card, a way-out row and the source editor. The
sentence SHALL match the row on the Checks tab word for word.

#### Scenario: One sentence at the spot and on the tab

- **WHEN** one issue stands on a step page and on the Checks tab
- **THEN** both print the same sentence
- **AND** neither prints a source label outside a Developer view

### Requirement: A step's checks stand at their sections and keys at More

The step page SHALL route each open issue naming a step to the section that
owns it. An issue naming a way out, a time limit or an action under the step
SHALL take the same route. A check on the step's key SHALL belong to More. The
section's header SHALL carry the count. The body SHALL print a step-level issue
above its controls. A row's own issue SHALL stay at that row.

#### Scenario: A time limit's check counts on Time limit

- **WHEN** a check names a step's time limit
- **THEN** the Time limit header carries a badge reading 1
- **AND** the sentence stands at that time limit's row inside the body
- **AND** the Checks tab lists the same check

#### Scenario: A step-level check stands above the controls

- **WHEN** a structural check names a step's assignment
- **THEN** the Who acts body prints the sentence above the assignment controls
- **AND** no other section prints it

#### Scenario: A key check stands in More

- **WHEN** a check names a step's own key
- **THEN** the More header counts it
- **AND** More's body prints the sentence
- **AND** the masthead does not print it

### Requirement: A step's name check stands under Name

A check on the step's name SHALL stand directly under Name. A check on its
description SHALL stand directly under Description. The masthead's end SHALL
keep any other issue no section owns. The Checks tab SHALL keep listing every
one of them.

#### Scenario: A name check stands under Name

- **WHEN** a check names a step's own name
- **THEN** the sentence stands directly under the Name input
- **AND** no section header counts it

#### Scenario: A kind check stays on the masthead

- **WHEN** a check names a step's own type
- **THEN** the sentence stands at the masthead's end
- **AND** the Checks tab lists the same check

## MODIFIED Requirements

### Requirement: A draft with no step yet shows a start state

A draft whose step list is empty SHALL read as a start state. Its missing
first step SHALL NOT count as an open issue. The Checks count then reads 0.

With no other open issue, the rail SHALL show one sentence and no subject.
That sentence names where to add the first step. The all-clear state SHALL
stay hidden. With some other open issue, the sentence SHALL stand first and
the subjects SHALL follow.

#### Scenario: A fresh empty draft shows the start sentence alone

- **WHEN** an author opens the Checks tab on a draft the empty choice just
  seeded
- **THEN** the rail shows one sentence
- **AND** that sentence names the Canvas and the Steps tab as the places to
  add the first step
- **AND** it shows no subject and no line
- **AND** it does not show its all-clear state
- **AND** the Checks tab's count reads 0 in its ordinary color and weight

#### Scenario: The start state ends with the first step

- **WHEN** an author adds the first step to a draft in the start state
- **THEN** the start sentence leaves the rail
- **AND** the rail shows its rows under its other requirements

#### Scenario: Removing the last step returns the start state

- **WHEN** an author removes the only step of a draft
- **THEN** the rail shows the start sentence again

#### Scenario: Another open issue keeps its group beside the start sentence

- **WHEN** a draft with no step also carries an open Zod issue of another
  kind
- **THEN** the start sentence stands first
- **AND** that issue's row stands under its subject
- **AND** the held-back line stands under Before publishing

#### Scenario: No line names the validator in the start state

- **WHEN** the rail or the header bar renders a draft in the start state
- **THEN** no text reads "zod" or "Invalid input"

### Requirement: An unnamed process reads one sentence at its name

A draft that holds a step but no base-locale name SHALL report that gap as
one open issue. The issue SHALL read as one sentence: the process needs a
name. The sentence SHALL name the field at the top of the page. It SHALL
stand in the header bar beside the name. There it SHALL print no source label. It
SHALL count as a blocker, and the rail SHALL list it under Before publishing.

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
- **AND** the rail lists the same sentence under Before publishing

#### Scenario: Typing a name clears the sentence

- **WHEN** an author types a name into the header bar's name field
- **THEN** the sentence leaves the header bar and the rail

### Requirement: The rail reports two view-flag stopping states

Two combinations of view flags stop a step, and the rail SHALL report
both. Each reads off `view.fields[]` alone. Each carries the `view`
source, and each anchors on the step that holds the view entry.

Both states SHALL read field entries alone. A note has no `required`
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
- **THEN** the rail shows a Worth a look row naming that field

#### Scenario: An unwritable required field reports

- **WHEN** a step's view entry carries `readonly: true` and
  `required: true`
- **AND** no step's view makes that field editable
- **AND** no action output, subprocess output mapping, column mapping or
  contract input field targets it
- **THEN** the rail shows a Worth a look row naming that field

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
- **THEN** the rail shows a Worth a look row naming that field

#### Scenario: A placed technical field still reports

- **WHEN** a field declares `technical: true` and a step's view entry
  places it visibly
- **AND** no action output, subprocess output mapping, column mapping or
  contract input field targets it
- **THEN** the rail shows a Worth a look row naming that field

#### Scenario: A default does not exempt an unwritten technical field

- **WHEN** a field declares `technical: true` and a `default`
- **AND** no action output, subprocess output mapping, column mapping or
  contract input field targets it
- **THEN** the rail shows a Worth a look row naming that field

#### Scenario: A structurally written technical field raises nothing

- **WHEN** a field declares `technical: true`
- **AND** an `Action.output` map targets that field
- **THEN** the rail shows no entry for it

#### Scenario: A non-technical field never raises this finding

- **WHEN** a field declares no `technical` key and no structural source
  writes it
- **THEN** the rail shows no entry for it under this finding

### Requirement: The rail adds a consolidated view; a field's checks stand at their zones

`IssueList` SHALL keep rendering its existing per-entity views. Those views
sit under the process header, on a step page, and on a path row. The Checks
tab is one more consolidated view over the same `validation.issues[]` array.
It does not replace those placements.

The Fields tab is the one placement that changes. A field's own check SHALL
stand at the zone the check names, per the `studio-app` capability's zone
requirement. The Fields tab SHALL mount no `IssueList` gathering that field's
checks in one place.

The reason the old placement existed still holds, and the zone rule answers
it. A check inside one section of a field hid whenever the author opened
another section. Zones open none, so no check hides.

#### Scenario: An issue shows in both its entity placement and the rail

- **WHEN** a path guard carries a CEL issue
- **THEN** that issue's sentence stands in the path's own `IssueList` placement
  and on a Checks tab row

#### Scenario: A field's check shows at its zone and in the rail

- **WHEN** a field carries a validation issue
- **THEN** the check stands inside the field card's More, under Validation
- **AND** the Checks tab's own count includes it

#### Scenario: No zone hides a field's check

- **WHEN** a field carries checks naming two different zones
- **THEN** both checks stand at once, and neither waits on the author opening
  anything

## REMOVED Requirements

<!-- antislop: allow sentence-length -->
<!-- Why: the heading repeats the live spec's wording, which a REMOVED block must match. -->
### Requirement: The rail lists every open issue, grouped by source
**Reason**: Decision D5 groups the rows by subject, and a source name leaves the page.
**Migration**: "The Checks tab lists every open issue by subject" states the list. The source stands in a row's Developer view.

<!-- antislop: allow sentence-length -->
<!-- Why: the heading repeats the live spec's wording, which a REMOVED block must match. -->
### Requirement: The rail reflects the held-back state of a structurally invalid draft
**Reason**: Held-back groups become one line under Before publishing, so no group reads held back on its own.
**Migration**: "What has not run reads as one line under Before publishing" keeps the held-back reading, the chaining sites and the two checks publishing holds.

<!-- antislop: allow sentence-length -->
<!-- Why: the heading repeats the live spec's wording, which a REMOVED block must match. -->
### Requirement: Every publish blocker is visible in the rail with all groups clear
**Reason**: No group stands any more, and its scenarios name them.
**Migration**: "The all-clear state stands only with no open issue" keeps the rule and what a clear rail predicts.

<!-- antislop: allow sentence-length -->
<!-- Why: the heading repeats the live spec's wording, which a REMOVED block must match. -->
### Requirement: A step's checks stand at their sections
**Reason**: A check on a step's key moves from the masthead into More, which reverses a base scenario.
**Migration**: "A step's checks stand at their sections and keys at More" and "A step's name check stands under Name" state the route.

<!-- antislop: allow sentence-length -->
<!-- Why: the heading repeats the live spec's wording, which a REMOVED block must match. -->
### Requirement: An issue's source prints as a label
**Reason**: Principle 2 keeps a validator's name behind the Developer view.
**Migration**: "A check prints its sentence at every placement" and "A row's Developer view holds the check kind" state the two sides.
