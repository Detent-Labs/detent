## Purpose

The Steps tab is the guided way through a process. A numbered rail stands
beside one wide page, and that page holds everything one step declares. An
author walks the process from its first step to its last without a diagram.

## ADDED Requirements

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

### Requirement: The steps rail numbers every step in reachability order

The rail SHALL list every step of the draft. The order SHALL be reachability
order, the same order the steps register uses today. Each row SHALL carry a
number, the step's label and one summary line.

The summary line SHALL name who works the step and how many fields its form
carries. A subprocess step's line SHALL name the process it calls. An end
step's line SHALL name its outcome.

#### Scenario: A row summarizes its step

- **WHEN** a task step names a group as its assignment and carries four view
  fields
- **THEN** its rail row names that group
- **AND** the same row reads four fields

#### Scenario: An end step names its outcome

- **WHEN** an end step declares the outcome `approved`
- **THEN** its rail row names that outcome

### Requirement: A rail row carries its own open issue count

A rail row SHALL carry the number of open issues that name its step. A row
with no issue SHALL carry no badge. The badge SHALL take the blocker color
where any of those issues blocks a publish.

#### Scenario: The rail marks a step with a blocker

- **WHEN** one step leads nowhere and carries no other issue
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
collapse. The leading column SHALL carry Path to, Assignment, Which process it
calls, and How the case ends. The trailing column SHALL carry On entry, On
exit, Time limit, and Step form fields.

A section SHALL stand only where the step's kind declares it. A task step
carries Assignment. A subprocess step carries Which process it calls. An end
step carries How the case ends. It carries no outgoing path, so it carries
neither On exit nor Time limit.

This replaces the runtime-order register of collapsible sections. An author
reads every setting of one step without opening anything.

#### Scenario: A task step carries the task sections

- **WHEN** the step page holds a task step that is not an end
- **THEN** the page carries Path to, Assignment, On entry, On exit, Time limit
  and Step form fields
- **AND** the page carries no Which process it calls section

#### Scenario: An end step carries no outgoing path

- **WHEN** the step page holds an end step
- **THEN** the page carries How the case ends
- **AND** the page carries no Path to section and no On exit section
- **AND** the page carries no Time limit section

#### Scenario: Every section stands open

- **WHEN** an author opens any step on the step page
- **THEN** every section of that step is readable without a press

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

The JSON SHALL be read-only here. The JSON surface stays the one place for
hand-authoring a definition.

#### Scenario: The Developer view carries the step's JSON

- **WHEN** an author opens the Developer view disclosure
- **THEN** the disclosure carries that step's JSON
- **AND** the disclosure names the step's `id`

#### Scenario: The Developer view accepts no typing

- **WHEN** an author types into the Developer view's JSON
- **THEN** the draft does not change
