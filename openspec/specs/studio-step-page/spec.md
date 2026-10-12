# studio-step-page Specification

## Purpose

The Steps tab is the guided way through a process. A numbered rail stands
beside one wide page, and that page holds everything one step declares. An
author walks the process from its first step to its last without a diagram.

## Requirements

### Requirement: The Steps tab lays out a rail beside one page

The Steps tab SHALL carry a steps rail on its leading edge and one step page
beside it. The rail SHALL keep a fixed width and scroll on its own. The page
SHALL hold the one selected step.

Selecting a step in the rail SHALL open that step on the page. The rail SHALL
mark which step the page holds.

#### Scenario: Picking a step in the rail opens it

- **WHEN** an author presses the third row of the steps rail
- **THEN** the step page holds that step
- **AND** the rail marks that row as the current one

### Requirement: The steps rail lists each step in the draft's own order

The rail SHALL list every step of the draft, in the order `workflow.steps`
holds them. No walk over the paths SHALL decide where a row stands.

A row's number SHALL name the step's place in that order. Dragging a row to
any position in the list SHALL move it there. That move SHALL land in the
rail and in the draft together.

Each row SHALL carry a number and the step's label. A row SHALL have no summary
line under the label. That holds for every step kind: a task step, a call to
another process, and an end step. The step page names who works a step, the
fields its form carries, the process it calls and its outcome.

#### Scenario: The rail numbers steps in the draft's own order

- **WHEN** a draft holds a call step, then an end step, then a task step
- **THEN** the rail numbers the call one, the end two and the task three

#### Scenario: A move control moves its own row

- **WHEN** an author drags the rail's fourth row and drops it between the
  first and second row
- **THEN** that row stands second
- **AND** the rows that stood first through third each move one place later

#### Scenario: A keyboard move relocates the focused row

- **WHEN** an author focuses the rail's third row's grip and issues the
  move-later command
- **THEN** that row stands fourth
- **AND** keyboard focus stays on the moved row's grip
- **AND** a live region announces the row's label and its new position

#### Scenario: A task row names no assignment and no field count

- **WHEN** a task step names a group as its assignment and carries four view
  fields
- **THEN** its rail row carries the step's number and label
- **AND** the row names neither who works the step nor a field count

#### Scenario: A call row names no process

- **WHEN** a subprocess step calls the process labeled "Credit check"
- **THEN** its rail row has no line naming that process

#### Scenario: An end row names no outcome

- **WHEN** an end step declares the outcome `approved`
- **THEN** its rail row has no line naming that outcome

### Requirement: A rail row carries its own open issue count

A rail row SHALL carry the number of open issues that name its step. A row
with no issue SHALL display no badge. The badge SHALL take the blocker color
where any of those issues blocks a publish.

#### Scenario: The rail marks a step with a blocker

- **WHEN** one step leads nowhere and has no other issue
- **THEN** that step's rail row carries a badge reading one
- **AND** the badge takes the blocker color

### Requirement: The rail reorders steps and adds new ones

Each rail row SHALL carry a grip that drags it to any position in the list.
A drop SHALL move that step to the dropped position in the draft. Each row SHALL also
answer a move-earlier and a move-later command from the keyboard whenever
an author focuses its grip.
`spa-accessibility` already requires this: a list offering a drag move
answers that same move from the keyboard, in the list itself. The first row
SHALL refuse the move-earlier command. The last row SHALL refuse the
move-later command.

The rail's foot SHALL carry three controls that add a step, a call to another
process, and an end.

#### Scenario: The first row cannot move earlier

- **WHEN** an author, with the rail's first row's grip focused, issues the
  move-earlier command
- **THEN** the row stays first

#### Scenario: The foot adds an end step

- **WHEN** an author presses the add-an-end control in the rail's foot
- **THEN** the draft carries one more end step
- **AND** the step page holds the new step

### Requirement: The step page names its step and renames it in place

The step page SHALL open with a kicker naming the step's number and its kind.
The step's label SHALL sit under that kicker as a writable line. Typing in
that line SHALL rename the step in the draft.

The step's label and its key SHALL stand side by side in one row, the label
in the wider column. Under the step page's narrow-viewport breakpoint the row
SHALL collapse to one column, label over key. The label's missing-translation
warning SHALL stand under the label's own column, never spanning the row
under the key.

The page SHALL mark the draft's first step. The page SHALL carry one control
that removes the step.

#### Scenario: Renaming the step on the page

- **WHEN** an author types a new label in the step page's name line
- **THEN** the draft carries the new label
- **AND** the rail row for that step reads the new label

#### Scenario: The page marks the first step

- **WHEN** the step page holds the draft's initial step
- **THEN** the page carries a mark naming it the first step

#### Scenario: The label and key stand in one row

- **WHEN** an author opens a step on a wide viewport
- **THEN** the label and its key stand in one row
- **AND** the label's column is wider than the key's column

#### Scenario: The row collapses under the narrow breakpoint

- **WHEN** an author opens a step under the step page's narrow-viewport
  breakpoint
- **THEN** the label stands over the key, each its own full-width row

#### Scenario: A missing-translation warning stays under the label

- **WHEN** the step's label is missing a translation for the content locale
- **THEN** the warning stands under the label's own column
- **AND** the warning does not span the width of the key's column

### Requirement: The Path to section stands each path's Label and Key side by side

Each path row in the Path to section SHALL stand its Label and Key fields
side by side. The row SHALL use two columns, the label in the wider one.

Under the step page's narrow-viewport breakpoint the row SHALL collapse to
one column, label over key. This is the same row pattern the step's own
Label and Key already use in the masthead.

The row's "to" field SHALL stand in its own full-width row below Label and
Key. It SHALL stand outside the Label/Key row.

#### Scenario: A path's Label and Key stand in one row

- **WHEN** an author opens the Path to section on a wide viewport
- **THEN** a path row's label and its key stand in one row
- **AND** the label's column is wider than the key's column

#### Scenario: A path row collapses under the narrow breakpoint

- **WHEN** an author opens the Path to section under the step page's
  narrow-viewport breakpoint
- **THEN** a path row stands the label over the key, each its own
  full-width row

#### Scenario: The "to" field stays on its own row

- **WHEN** an author opens the Path to section on a wide viewport
- **THEN** a path row's "to" field stands on its own row below the label
  and key row

### Requirement: The step page stands its sections open in two columns

The step page SHALL lay its sections in two columns. No section SHALL
collapse. The leading column SHALL carry Path to, Assignment, Cancellable,
Which process it calls, and How the case ends. The trailing column SHALL
carry On entry, On exit, Time limit, Step form fields, and Collaboration.

A section SHALL stand only where the step's kind declares it. A task step
carries Assignment. A subprocess step carries Which process it calls. An end
step carries How the case ends. It has no outgoing path, so it carries
neither On exit nor Time limit.

A task step and a subprocess step both carry Cancellable. An end step has no
Cancellable section. An instance resting on a terminal step has already left
the running state the field governs. So the setting has nothing left to
apply to.

A subprocess step also drops the Collaboration section. It is an automatic
wait-state with no participant-facing task screen for the setting to govern.

This replaces the runtime-order register of collapsible sections. An author
reads every setting of one step without opening anything.

#### Scenario: A task step carries the task sections

- **WHEN** the step page holds a task step that is not an end
- **THEN** the page carries Path to, Assignment, Cancellable, On entry, On
  exit, Time limit, Step form fields and Collaboration
- **AND** the page has no Which process it calls section

<!-- Why: this heading is what a future MODIFIED delta against this
     requirement will need to match, byte for byte. -->
<!-- antislop: allow negation-habit -->
#### Scenario: An end step carries no outgoing path

- **WHEN** the step page holds an end step
- **THEN** the page carries How the case ends
- **AND** the page has no Path to section, no On exit section, no Time
  limit section and no Cancellable section

#### Scenario: Every section stands open

- **WHEN** an author opens any step on the step page
- **THEN** every section of that step is readable without a press

#### Scenario: A subprocess step has no Collaboration section

- **WHEN** the step page holds a subprocess step
- **THEN** the page carries Which process it calls
- **AND** the page has no Collaboration section

### Requirement: The Cancellable section sets a step's participant-cancel override

The Cancellable section SHALL let an author set that step's `cancellable`
field to one of three states. Those are unset (inherit the process's own
default), explicitly cancellable, or explicitly not cancellable. Setting it SHALL write
`Step.cancellable` in the draft; choosing the inherit state SHALL remove the
key from the step rather than writing a redundant explicit value equal to the
process's current default.

The section SHALL name the effective outcome in the inherit state: whether a
running instance would resolve as cancellable there. That way, an author
need not open the process-wide setting separately to know what "inherit"
currently means.

#### Scenario: Setting a step to explicitly not cancellable

- **WHEN** an author sets a task step's Cancellable section to "not
  cancellable"
- **THEN** the draft's step carries `cancellable: false`

#### Scenario: Returning a step to the inherited default

- **WHEN** an author returns a step's Cancellable section from an explicit
  state to "inherit"
- **THEN** the draft's step has no `cancellable` key

#### Scenario: The inherit state names the process's current default

- **WHEN** a step's Cancellable section stands in the inherit state and the
  process itself declares `cancellable: false`
- **THEN** the section names the effective outcome as not cancellable

### Requirement: The Collaboration section offers a three-state control per field

The Collaboration section SHALL carry a three-state control each for
Comment and Attachments, offering three states: Default, On, and Off.
Selecting Default SHALL clear the step's own override for
that key, so the step reads as `undefined` for it. It then inherits the
process default at once, including any later change to it. Selecting On
or Off SHALL set the step's own override to `true` or `false`. While
Default is the selected state, the control SHALL visibly name the
process-wide default's current resolved value for that key. That value
might read as "Currently: on", for example.

#### Scenario: Selecting Default clears the step's own override

- **WHEN** an author selects Default on the Attachments control for a
  step that previously overrode `attachments: false`
- **THEN** the step's `collaboration.attachments` becomes `undefined`,
  and the control names the process's current default value

#### Scenario: A step's override survives a later process-default change

- **WHEN** an author sets a step's Attachments control to On, overriding
  a process default of `false`
- **THEN** changing the process-wide default afterward SHALL NOT change
  that step's resolved `attachments`, which stays `true`

### Requirement: A section prints its own open issues beside its heading

Each section SHALL print the open issues that belong to it, beside its own
heading. An issue about the assignment SHALL stand at Assignment. An issue
about an outgoing path SHALL stand at Path to. An issue about the form SHALL
stand at Step form fields.

An issue SHALL stand at exactly one section. The Checks tab SHALL keep listing
every issue, including those a section already prints.

#### Scenario: An unassigned step prints its issue at Assignment

- **WHEN** a task step declares no assignment
- **THEN** the Assignment section prints that issue beside its heading

#### Scenario: The Checks tab keeps the same issue

- **WHEN** the Assignment section prints an issue
- **THEN** the Checks tab still lists that issue

### Requirement: The step page walks to the previous and the next step

The step page's foot SHALL carry one control that opens the previous step and
one that opens the next step. The order SHALL be the rail's order. Each
control SHALL name the step it opens.

The control SHALL refuse the press at the end of the walk it belongs to.

#### Scenario: The next control names its step

- **WHEN** the next step in the rail carries the label "Credit check"
- **THEN** the next control names "Credit check"

#### Scenario: The last step refuses the next control

- **WHEN** the step page holds the last step in the rail's order
- **THEN** the next control refuses the press

### Requirement: The step page carries a Developer view of the step

The step page SHALL carry a Developer view disclosure at its foot. The
disclosure SHALL stand closed until an author opens it. An open disclosure
SHALL carry the step's own JSON and the step's `id`.

<!-- antislop: allow synonym-rotation -->
<!-- Why: "JSON surface" is this codebase's fixed UI-glossary term for the raw definition-editing screen (.claude/rules/ui-glossary.md), not a rotated synonym for a display/show/carry verb used elsewhere in this file. -->
The JSON SHALL be read-only here. The JSON surface stays the one place for
hand-authoring a definition.

#### Scenario: The Developer view carries the step's JSON

- **WHEN** an author opens the Developer view disclosure
- **THEN** the disclosure carries that step's JSON
- **AND** the disclosure names the step's `id`

#### Scenario: The Developer view accepts no typing

- **WHEN** an author types into the Developer view's JSON
- **THEN** the draft does not change

### Requirement: The first process choice on a subprocess step writes a whole spec

A new subprocess step has no `subprocess` spec. An author may pick a process
in "Which process it calls" on such a step. The step page SHALL then write a
complete spec in one edit. The spec SHALL hold the chosen `processId` and
`versionBinding: "pinned"`. It SHALL hold the chosen process's newest version
as `pinnedVersion`, and an empty `inputMapping` and `outputMapping`.

A step that already has a spec keeps its binding and its mappings when the
author picks another process. Only `processId` changes. A pinned binding also
takes the newest version of the new process as `pinnedVersion`.

A step with no spec SHALL show the process select alone. It SHALL show no
binding select, no version field and no mapping editor. The draft therefore
never reads "pinned" while the stored body lacks it.

#### Scenario: Choosing a process on a new subprocess step

- **WHEN** an author picks the process "Credit check", whose newest version is
  3, on a subprocess step with no spec
- **THEN** the step has that `processId`, `versionBinding` `pinned`,
  `pinnedVersion` 3, `inputMapping` `{}` and `outputMapping` `{}`
- **AND** the Checks tab reports no Zod "Required" issue for the spec

#### Scenario: Choosing another process on a step with a spec

- **WHEN** an author picks a different process on a subprocess step whose
  binding is `latest-at-spawn` with a `contractRef`
- **THEN** the step keeps `versionBinding`, `contractRef` and both mappings
- **AND** only `processId` changes

#### Scenario: A step with no spec shows the process select alone

- **WHEN** the step page shows a subprocess step with no `subprocess` spec
- **THEN** "Which process it calls" shows the process select
- **AND** it shows no binding select, no version field and no mapping editor

### Requirement: The inputMapping editor offers the child's input fields as keys

The `inputMapping` editor in "Which process it calls" SHALL offer the called
process's `contract.inputFields` as its keys. It SHALL offer none of the
calling process's own fields. Each option SHALL print the child field's `key`
and store the child field's `id`.

The step page SHALL read the child's contract from the body of the version the
binding names. A `pinned` binding names its `pinnedVersion`. A
`latest-at-spawn` binding names the newest version in the process list. The
page SHALL read once per process and version, through the studio's existing
version-body route.

"+ add" SHALL pick the first child input field that no row holds. It SHALL
stay disabled while the list is empty, exhausted, loading or failed. While the
read loads or after it fails, a one-line note SHALL say so. A child with no
`contract` or no `inputFields` SHALL get a note saying it declares no input
fields. A child whose input fields all have a row SHALL get a note saying every
input field has a row. The note region SHALL be a status region. The disabled
"+ add" SHALL point at the note.

The editor SHALL keep every stored key as stored. Once the child's input
fields have loaded, a stored key outside that list SHALL appear as its own
marked option. Before then, a stored key shows without the mark,
because the list is unknown. The select therefore
never shows another key than the stored one. The author may remove that row or
pick a listed key for it. The `outputMapping` editor keeps the calling
process's fields as targets.

#### Scenario: A pinned binding lists the child's input fields

- **WHEN** a subprocess step calls "Credit check" pinned at version 2, and
  version 2 declares `contract.inputFields` of `amount` and `applicant`
- **THEN** the `inputMapping` select offers `amount` and `applicant`
- **AND** the select offers no field of the calling process

#### Scenario: A latest-at-spawn binding reads the newest version

- **WHEN** a subprocess step calls "Credit check" with `latest-at-spawn` and
  the process list names version 5 as the newest
- **THEN** the editor reads the contract of version 5

#### Scenario: Opening a valid mapping shows the stored key

- **WHEN** an author opens a step whose `inputMapping` maps the child field
  `amount`, and the child lists it
- **THEN** the row's select shows `amount`
- **AND** the stored key stays as it was

#### Scenario: The read fails

- **WHEN** the child's version body fails to load
- **THEN** "+ add" stays disabled
- **AND** a note says the child's input fields could not load
- **AND** every stored `inputMapping` row stays as stored

#### Scenario: A stored key while the list loads

- **WHEN** a row has a stored key and the child's version body is still loading
- **THEN** the row's select shows the stored key without a mark

#### Scenario: Every input field has a row

- **WHEN** the child lists two input fields and the `inputMapping` has a row for
  each
- **THEN** "+ add" stays disabled
- **AND** a status note says every input field has a row

#### Scenario: A stored key the child no longer lists

- **WHEN** a row has a key that the child's contract does not list
- **THEN** the row's select shows a marked option for that key
- **AND** the row stays until the author changes or removes it

### Requirement: A kind switch confirms before it removes keys

The step's "performed by" control SHALL remove the keys a new kind cannot
carry. It SHALL confirm first when the step has any of them. The keys per
target kind are:

- A task step (the "participant" option) cannot carry `subprocess` or
  `outcome`.
- A subprocess step cannot carry `outcome`.
- An end step cannot carry `subprocess`, `paths`, `timers`, `onExit`,
  `onCancel` or `cancellable`.

A switch that removes nothing SHALL apply at once, with no dialog. A switch
that removes something SHALL open a modal dialog first. The dialog SHALL name
the target kind and count what it removes, one fact row per kind of key. A
count is the number of entries, or 1 for a single key. The dialog SHALL show
no step content and SHALL state that the studio has no undo.

Cancel SHALL hold the initial focus. The confirming control SHALL stay outlined.
It SHALL remove the keys and switch the kind in one edit. Cancel, Escape or a
confirm SHALL return focus to the control that opened the dialog. A decline
leaves the step as it was.

#### Scenario: A subprocess step switches to a task step

- **WHEN** an author presses the task option on a subprocess step that has a
  `subprocess` spec
- **THEN** a dialog opens that counts one subprocess call
- **AND** the step stays as it was until the author confirms

#### Scenario: Confirming removes the spec

- **WHEN** the author confirms that dialog
- **THEN** the step has `type` `task` and no `subprocess` key
- **AND** the Checks tab stops reporting "only a subprocess step may declare a
  subprocess spec"

#### Scenario: A task step with paths switches to an end

- **WHEN** an author presses the end option on a task step with three paths,
  one timer and one `onExit` action
- **THEN** the dialog counts three paths, one time limit and one exit action
- **AND** a decline leaves all of them in place

#### Scenario: A switch that removes nothing skips the dialog

- **WHEN** an author presses the end option on a task step
- **AND** the step has no paths, timers, exit actions, cancel actions or
  `cancellable` key
- **THEN** the step becomes an end step at once
- **AND** no dialog opens

#### Scenario: Cancel holds the focus

- **WHEN** the dialog opens
- **THEN** keyboard focus stands on Cancel
- **AND** Enter on the open dialog declines

### Requirement: An emptied outcome field writes no outcome

The "How the case ends" outcome text field SHALL write no `outcome` key when
the author empties it. The field shows where the process declares no
`contract.outcomes`. An empty string would stay on the step after a later kind
switch and trip the publish check that restricts `outcome` to an end step.

#### Scenario: Emptying the outcome text

- **WHEN** an author clears the outcome text on an end step
- **THEN** the step has no `outcome` key

### Requirement: A timer keeps the kind the author chose

A timer has one of two kinds, a time limit or a deadline. The kind select SHALL show the kind the stored timer holds. Clearing the deadline text SHALL keep the timer a deadline with an empty expression. It SHALL NOT turn the timer into a time limit, and the deadline input SHALL stay on the page.

#### Scenario: An emptied deadline stays a deadline

- **WHEN** a timer holds the deadline `data.due_at`
- **AND** the author clears the deadline text
- **THEN** the kind select still reads the deadline kind
- **AND** the deadline input still shows, empty
- **AND** the timer holds `deadline` with an empty `src` and no `duration`

#### Scenario: The author can still switch kind

- **WHEN** the deadline text is empty
- **AND** the author picks the time limit kind
- **THEN** the timer holds a `duration` and no `deadline`
- **AND** the number and unit controls show

### Requirement: The walk keeps keyboard focus

Previous and Next walk from one step to its neighbour. Each press mounts the page of the other step. After a press, keyboard focus SHALL stay on the control the author pressed. At the end of the walk that control turns off. Focus SHALL then move to the other walk control.

#### Scenario: Next keeps the focus

- **WHEN** the author presses Next on step 2 of 4
- **THEN** the page of step 3 shows
- **AND** Next holds the focus

#### Scenario: The last step hands focus to Previous

- **WHEN** the author presses Next and reaches the last step
- **THEN** Previous holds the focus
