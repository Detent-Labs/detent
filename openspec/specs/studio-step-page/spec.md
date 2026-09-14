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

A row's number SHALL name the step's place in that order. Moving a row earlier
or later SHALL move it in the rail and in the draft together.

Each row SHALL carry a number and the step's label. A row SHALL have no summary
line under the label. That holds for every step kind: a task step, a call to
another process, and an end step. The step page names who works a step, the
fields its form carries, the process it calls and its outcome.

#### Scenario: The rail numbers steps in the draft's own order

- **WHEN** a draft holds a call step, then an end step, then a task step
- **THEN** the rail numbers the call one, the end two and the task three

#### Scenario: A move control moves its own row

- **WHEN** an author presses Move earlier on the rail's third row
- **THEN** that row stands second
- **AND** the row that stood second stands third

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

Each rail row SHALL carry a control to move the step earlier and one to move
it later. The first row SHALL refuse the earlier control. The last row SHALL
refuse the later control.

The rail's foot SHALL carry three controls that add a step, a call to another
process, and an end.

#### Scenario: The first row cannot move earlier

- **WHEN** an author reads the first rail row
- **THEN** its move-earlier control refuses the press

#### Scenario: The foot adds an end step

- **WHEN** an author presses the add-an-end control in the rail's foot
- **THEN** the draft carries one more end step
- **AND** the step page holds the new step

### Requirement: The step page names its step and renames it in place

The step page SHALL open with a kicker naming the step's number and its kind.
The step's label SHALL sit under that kicker as a writable line. Typing in
that line SHALL rename the step in the draft.

The page SHALL mark the draft's first step. The page SHALL carry one control
that removes the step.

#### Scenario: Renaming the step on the page

- **WHEN** an author types a new label in the step page's name line
- **THEN** the draft carries the new label
- **AND** the rail row for that step reads the new label

#### Scenario: The page marks the first step

- **WHEN** the step page holds the draft's initial step
- **THEN** the page carries a mark naming it the first step

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
