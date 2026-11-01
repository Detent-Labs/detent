# studio-step-page Specification

## Purpose

The Steps tab is the guided way through a process. A numbered rail stands
beside one wide page, and that page holds everything one step declares. An
author walks the process from its first step to its last without a diagram.

## Requirements

### Requirement: The Steps tab lays out a rail beside one page

The Steps tab SHALL carry a steps rail on its leading edge and one step page
beside it. The rail SHALL keep a fixed width of 22rem and scroll on its own.
The page SHALL hold the one selected step.

Selecting a step in the rail SHALL open that step on the page. The rail SHALL
mark which step the page holds.

Below 64rem the rail SHALL stand above the page, capped at 20rem, and scroll
inside that cap. The page SHALL then scroll with the tab body rather than on
its own. The tab body then holds two scroll boxes.

#### Scenario: Picking a step in the rail opens it

- **WHEN** an author presses the third row of the steps rail
- **THEN** the step page holds that step
- **AND** the rail marks that row as the current one

#### Scenario: The page scrolls with the tab body below 64rem

- **WHEN** the window stands 420px wide and the open step's body outgrows the
  viewport
- **THEN** the tab body scrolls the rail and the page as one
- **AND** the page has no scroll box of its own

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

A step with no label SHALL read "(unnamed step)" in its row. The row SHALL
print no key.

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

#### Scenario: An unnamed step's row reads the placeholder

- **WHEN** a step has an empty label and the key `review`
- **THEN** its rail row reads "(unnamed step)"
- **AND** the row does not contain `review`

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

### Requirement: The step page names its step and keeps its key in the Developer view

The step page SHALL open with a kicker naming the step's number and its
kind. The step's name SHALL sit under that kicker as a writable line
captioned "Name", at the page's full width. "Description" SHALL follow it.
Typing in the name line SHALL rename the step. The masthead SHALL have no
key input.

The step's key input SHALL stand inside the Developer view under "Key",
and typing there SHALL write the key. The page SHALL mark the first step
and carry one control that removes the step. That control SHALL open the
confirmation dialog this capability requires.

#### Scenario: Renaming the step on the page

- **WHEN** an author types a new name in the step page's name line
- **THEN** the draft carries the new label
- **AND** the rail row for that step reads the new label

#### Scenario: The page marks the first step

- **WHEN** the step page holds the draft's initial step
- **THEN** the page carries a mark naming it the first step

#### Scenario: The masthead has no key input

- **WHEN** an author opens a step on the step page
- **THEN** the masthead carries the name line and the description
- **AND** no input in the masthead holds the step's key

#### Scenario: The key stands in the Developer view and still writes

- **WHEN** an author opens the Developer view and types a new key
- **THEN** the draft carries the new key for that step
- **AND** the JSON in the same disclosure shows it

#### Scenario: A missing-translation warning stays under the name

- **WHEN** the step's label is missing a translation for the content locale
- **THEN** the warning stands under the name line

### Requirement: A way out reads as a sentence and keeps its key in its own Developer view

Each row in the Ways out section SHALL open with a heading, such as
"Approve → Done". The heading reads the way out's name, an arrow and the
name of the target step. The target's name SHALL read as the "Leads to"
select prints that step. An unnamed way out SHALL read "(unnamed way out)"
there, and a way out with no target "(no step yet)". A target step with no
label SHALL read "(unnamed step)". The heading SHALL print no step key and no
step id.

The row's "Name" input and its "Leads to" select SHALL follow. The row SHALL hold a "Developer view"
disclosure, closed until opened, holding the way out's key input under
"Key". No key input SHALL stand outside it.

#### Scenario: A way out heads its row as a sentence

- **WHEN** a step carries a way out labelled "Approve" leading to a step
  labelled "Done"
- **THEN** that row's heading reads "Approve → Done"

#### Scenario: An unnamed way out says so in its heading

- **WHEN** a way out has an empty label
- **THEN** its heading reads "(unnamed way out)" before the arrow

#### Scenario: A way out's key stands in its Developer view

- **WHEN** an author opens a way out's row
- **THEN** no key input is visible until the row's Developer view opens
- **AND** typing a key inside that disclosure writes the way out's key

#### Scenario: A target step with no label reads as unnamed

- **WHEN** a way out labelled "Send" leads to a step with an empty label
  and the key `review`
- **THEN** that row's heading reads "Send → (unnamed step)"
- **AND** the heading does not contain `review`

### Requirement: Every step and way-out select on the step page lists labels

Three selects on the step page list steps or ways out. They are "Leads to",
"Where the new way out leads" and the time limit's way-out select. No option
SHALL print a key or an id.

A step SHALL read its label at the content locale, else at the base locale,
else "(unnamed step)". A way out SHALL read its row heading. Ways out that
share a heading SHALL add a count in list order, as in "Approve → Book (2)".
Each option SHALL store the entity's `id`.

#### Scenario: "Leads to" lists step labels

- **WHEN** a draft holds steps labelled "Antrag", "Prüfung" and "Abschluss"
  with the keys `antrag`, `pr_fung` and `abschluss`
- **THEN** a way out's "Leads to" select offers "Antrag", "Prüfung" and
  "Abschluss"
- **AND** no option reads `pr_fung`

#### Scenario: The new way out's target lists step labels

- **WHEN** an author opens the select "Where the new way out leads" on the
  same draft
- **THEN** it offers "Antrag", "Prüfung" and "Abschluss"

#### Scenario: An unnamed step reads as unnamed

- **WHEN** a draft holds a step with an empty label and the key `review`
- **THEN** both step selects offer that step as "(unnamed step)"

#### Scenario: The time limit lists ways out by their heading

- **WHEN** a step carries a way out labelled "Freigeben" leading to
  "Abschluss", with the key `pr-fung-abschluss`
- **THEN** the time limit's way-out select offers "Freigeben → Abschluss"
- **AND** no option reads `pr-fung-abschluss`

### Requirement: Every field-map select on the step page lists labels

Three field-map selects on the step page list fields. No option SHALL print
a key.

A field SHALL read its label at the content locale, else at the base locale,
else "(unnamed field)". A called process's field SHALL read its label in that
process's base locale. No group SHALL appear. A repeated text SHALL add a
count in list order. Each option SHALL store the field's `id`.

A stored id that no list holds SHALL print with the "(not in the list)" mark.

#### Scenario: An action's output mapping lists field labels

- **WHEN** an action on the step maps its result into the field labelled
  "Credit score" with the key `credit_score`
- **THEN** the row's select shows "Credit score"
- **AND** no option prints `credit_score`

#### Scenario: A field-map select leaves out a group

- **WHEN** the catalog holds a group labelled "Applicant" with two fields
- **THEN** the output-mapping select offers the two fields and not
  "Applicant"

#### Scenario: A stored id the list no longer holds stays visible

- **WHEN** an output-mapping row stores the id of a field the catalog no
  longer declares
- **THEN** the row's select shows that id with the "(not in the list)" mark

#### Scenario: A group the called process's contract names is not offered

- **WHEN** the called process's `contract.inputFields` names a group field
  and a field labelled "Amount"
- **THEN** the input-mapping select offers "Amount" and not the group

### Requirement: A repeated step label carries its steps-rail number

Steps that share a label SHALL each add their steps-rail number, as in
"Review (step 6)". This holds in every step select and way-out heading. Unnamed steps that
share the placeholder SHALL each read "(unnamed step 8)" with that number. A
step whose label no other step shares SHALL read its label alone.

#### Scenario: Two steps sharing a label carry their rail numbers

- **WHEN** a draft holds two steps labelled "Review", at rail rows 2 and 6
- **THEN** both step selects offer "Review (step 2)" and "Review (step 6)"
- **AND** a way out leading to the second one heads its row with
  "Review (step 6)"

#### Scenario: Two unnamed steps carry their rail numbers

- **WHEN** a draft holds two steps with empty labels, at rail rows 7 and 8
- **THEN** both step selects offer "(unnamed step 7)" and "(unnamed step 8)"

### Requirement: A way-out heading names its target once

A way-out heading SHALL name its target by the step select's text. A
way-out label can already end with an arrow and the target's label, plain
or numbered. The heading SHALL then print the label alone. A plain tail SHALL
take the numbered text where the target carries one. The time limit's select
SHALL take the studio select's form and span its column.

#### Scenario: A default way-out label does not repeat its target

- **WHEN** a way out labelled "Prüfung → Capture" leads to the step "Capture"
- **THEN** its row heading reads "Prüfung → Capture"
- **AND** the time limit's select offers "Prüfung → Capture"

#### Scenario: A default label names a repeated target by its number

- **WHEN** a way out labelled "Antrag → Review" leads to the second of two
  steps labelled "Review", at rail row 6
- **THEN** its row heading reads "Antrag → Review (step 6)"

### Requirement: A field-map row's controls carry accessible names

Each field-map row's select, value input and remove control SHALL carry an
accessible name. The remove control's name SHALL name the row's field.

#### Scenario: A mapping row's controls have names

- **WHEN** an action maps its result into the field labelled "Credit score"
- **THEN** the row's select, its value input and its remove control each
  carry an accessible name
- **AND** the remove control's name contains "Credit score"

### Requirement: The operand picker and the selects share one count rule

The condition builder's operand picker, the way-out select and the field-map
selects SHALL number a repeated text by one rule. The second and later item
sharing a text SHALL read "{label} ({n})", in list order. The step selects
name a repeat by its steps-rail number in its place, since the rail already
numbers each step.

#### Scenario: The picker and a select number a repeat alike

- **WHEN** the catalog holds two fields labelled "Name"
- **THEN** the operand picker offers "Name" and "Name (2)"
- **AND** an output-mapping select offers "Name" and "Name (2)"

### Requirement: The step page folds its sections into one accordion

The step page SHALL lay its sections in one column, under the masthead. Each
section SHALL hold a header and a body. The header SHALL be a button that
opens and closes the body. The body of a closed section SHALL stay out of
view. No section SHALL stand beside another.

#### Scenario: A task step's sections stand in one column

- **WHEN** the step page holds a task step
- **THEN** its sections stand one under the other
- **AND** each section's header is a button

#### Scenario: A closed body stays out of view

- **WHEN** a section stands closed
- **THEN** none of its controls is visible
- **AND** its header stays visible

### Requirement: A step's kind decides its sections

A task step SHALL carry six sections. They read Who acts, Form, Ways out,
Time limit, When entered or left and More, in that order. A subprocess step
SHALL swap Who acts and Form for Which process it calls, standing first. An
end step SHALL swap Ways out for How the case ends and have no Time limit.
Its fifth section SHALL read When entered.

More SHALL hold the Developer view. It SHALL hold Cancellable and the
Collaboration controls where the kind carries them.

#### Scenario: A task step carries six sections

- **WHEN** the step page holds a task step that is not an end
- **THEN** the headers read Who acts, Form, Ways out, Time limit, When entered
  or left and More, in that order
- **AND** no header reads Which process it calls or How the case ends

#### Scenario: A subprocess step calls a process first

- **WHEN** the step page holds a subprocess step
- **THEN** the headers read Which process it calls, Ways out, Time limit, When
  entered or left and More
- **AND** that is their order
- **AND** no header reads Who acts or Form

#### Scenario: An end step says how the case ends

- **WHEN** the step page holds an end step
- **THEN** the headers read Who acts, Form, How the case ends, When entered
  and More, in that order
- **AND** no header reads Ways out or Time limit

#### Scenario: More gathers the step's settings

- **WHEN** an author opens More on a task step
- **THEN** the body holds the cancelling control, the Comment and Attachments
  controls and the Developer view

### Requirement: A section header carries a summary and its state

Each header SHALL carry the section's name, a one-line summary of what it
holds, and a state. The summary SHALL use the author's words. A machine value
in it SHALL print in the mono face.

A done section SHALL carry a check mark named "Done". A section with an open
check SHALL carry the count instead, in the steps rail's badge. A section
still to do SHALL carry the word "To do". A section with nothing set and
nothing needed SHALL have no mark, and its summary SHALL say what is missing.

#### Scenario: Who acts names the assignment

- **WHEN** a task step assigns a group's members
- **THEN** the Who acts header's summary names that strategy in words
- **AND** the header carries the Done mark

#### Scenario: Ways out lists the ways out

- **WHEN** a step carries a way out "Approve → Done" and one "Reject →
  Rework"
- **THEN** the Ways out header's summary reads both headings
- **AND** the header carries the Done mark

#### Scenario: An empty section says what is missing

- **WHEN** a task step has no way out, and no check names its paths
- **THEN** the Ways out header's summary reads "No way out yet"
- **AND** the header reads "To do" and has no Done mark

#### Scenario: A section with a check carries the count

- **WHEN** a structural check names a step's assignment
- **THEN** the Who acts header carries a badge reading 1
- **AND** the header has no Done mark

#### Scenario: The open header carries the current mark

- **WHEN** Form stands open
- **THEN** the Form header carries the current mark on its leading edge
- **AND** its name prints in ink while the other five print in slate

#### Scenario: More summarizes the overrides

- **WHEN** a step overrides nothing of cancelling, comments or attachments
- **THEN** the More header's summary reads "Follows the process settings"

#### Scenario: How the case ends prints the outcome in mono

- **WHEN** an end step declares the outcome `approved`
- **THEN** the How the case ends header's summary reads `approved` in the
  mono face

### Requirement: One section stands open at a time

At most one section SHALL stand open. Opening a section SHALL close the open
one. Pressing the open section's header SHALL close it. A selected way out
SHALL open Ways out.

#### Scenario: Opening one closes the other

- **WHEN** Who acts stands open and the author presses the Form header
- **THEN** Form stands open
- **AND** Who acts stands closed

#### Scenario: The open header closes its section

- **WHEN** Form stands open and the author presses the Form header
- **THEN** no section stands open

#### Scenario: A selected way out opens Ways out

- **WHEN** a press on a canvas path selects a way out of this step
- **THEN** Ways out stands open
- **AND** that way out's row carries the current mark

### Requirement: The page opens on the section that needs the author

On open, the page SHALL open the first section carrying an open check. It
SHALL open the first section still to do when no section carries a check. It
SHALL open the first section when none is to do.

A section is to do where it is empty and the step needs it. Those are Ways
out and Which process it calls. Who acts counts on a task step with a manual
way out or none. How the case ends counts where the process declares
outcomes.

#### Scenario: A check decides which section opens first

- **WHEN** a step opens with a check on a time limit and none elsewhere
- **THEN** Time limit stands open

#### Scenario: An unassigned task step opens on Who acts

- **WHEN** a task step opens with no assignment and no open check
- **THEN** Who acts stands open

#### Scenario: A complete step opens on its first section

- **WHEN** a task step opens with an assignment, a way out and no open check
- **THEN** Who acts stands open

#### Scenario: An automatic step does not open on Who acts

- **WHEN** a task step with no assignment has two automatic ways out and no
  open check
- **THEN** Who acts has no To do word
- **AND** the page opens on Who acts only because it is the first section

### Requirement: Removing a step confirms first

Remove this step SHALL open a modal dialog before the removal. The dialog
SHALL name the step. It SHALL state that the studio has no undo.

Cancel SHALL hold the initial focus. The confirming control SHALL stay outlined. A decline
SHALL leave the step as it was. The control that opens the dialog SHALL take
the destructive outline.

#### Scenario: Pressing Remove this step opens the dialog

- **WHEN** an author presses Remove this step
- **THEN** a dialog opens naming the step
- **AND** the step stays until the author confirms

#### Scenario: Confirming removes the step

- **WHEN** the author confirms that dialog
- **THEN** the draft no longer holds the step
- **AND** the ways out that led to it stay, and the Checks tab reports them
- **AND** focus lands on the steps rail's current row

#### Scenario: Cancel holds the focus

- **WHEN** the dialog opens
- **THEN** keyboard focus stands on Cancel
- **AND** Enter on the open dialog declines

### Requirement: The removal dialog counts what the removal reaches

The dialog SHALL count the ways out of other steps that lead to the step. It
SHALL count the fields on its form too. Each count SHALL stand in one fact
row, where it is above zero. Where other steps lead to the step, the dialog
SHALL say that those ways out stay. It SHALL say the checks report them. Where the step
is the first step, the dialog SHALL say that the first remaining step takes
its place.

#### Scenario: Removing a step the others lead to

- **WHEN** an author presses Remove this step on a step two ways out lead to
- **THEN** the dialog counts two ways out leading here
- **AND** it says those ways out stay and the checks report them

#### Scenario: Removing a step nothing leads to

- **WHEN** an author presses Remove this step on a step no way out leads to
- **THEN** the dialog shows no fact row for ways out leading here

#### Scenario: Removing the first step

- **WHEN** an author presses Remove this step on the process's first step
- **THEN** the dialog says the first remaining step takes its place

### Requirement: The Form section states the form's size in words

The Form section SHALL state the step's form in one sentence. It counts field
entries as a Forms tab card counts them (`studio-forms-overview`). A group
entry and a note add nothing. Where a counted entry declares `required:
true`, the sentence SHALL state how many do. A view with no counted entry,
and a step with no view, SHALL read "No fields yet".

The section SHALL print no count of the whole catalog. The form editor SHALL
print no count of its own.

#### Scenario: A form with a required field

- **WHEN** a step's view holds four field entries and one declares
  `required: true`
- **THEN** the Form section reads "4 fields, 1 required"

#### Scenario: A step with no form yet

- **WHEN** a step declares no view
- **THEN** the Form section reads "No fields yet"

#### Scenario: A note raises no count

- **WHEN** a step's view holds one field entry and three notes
- **THEN** the Form section reads "1 field"

#### Scenario: A view of notes alone reads as empty

- **WHEN** a step's view holds notes alone
- **THEN** the Form section reads "No fields yet"

#### Scenario: The form editor shows no count

- **WHEN** the author opens the form editor
- **THEN** the editor prints no count of the form's fields

### Requirement: The Form section opens the step's form

The Form section SHALL carry one control that opens the form editor for the
step. It SHALL read "Start the form" while the section reads "No fields
yet", and "Open the form" otherwise. Those are the Forms card's own words.

#### Scenario: The control names an existing form

- **WHEN** a step's view holds one field entry
- **THEN** the Form section's control reads "Open the form"

#### Scenario: The control names a form to start

- **WHEN** a step declares no view
- **THEN** the Form section's control reads "Start the form"

#### Scenario: The control opens the form editor

- **WHEN** the author presses the Form section's control on the Approve
  step
- **THEN** the form editor opens for Approve, under the tab row with Steps
  current

### Requirement: The Cancellable section sets a step's participant-cancel override

<!-- antislop: allow sentence-length -->
<!-- Why: this paragraph is the live spec's own text, copied so the archive keeps it; only its first words changed. -->
The More section SHALL let an author set that step's `cancellable`
field to one of three states. Those are unset (inherit the process's own
default), explicitly cancellable, or explicitly not cancellable. Setting it SHALL write
`Step.cancellable` in the draft; choosing the inherit state SHALL remove the
key from the step rather than writing a redundant explicit value equal to the
process's current default.

The control SHALL name the effective outcome in the inherit state: whether a
running instance would resolve as cancellable there. That way, an author
need not open the process-wide setting separately to know what "inherit"
currently means. An end step SHALL have no cancelling control.

#### Scenario: Setting a step to explicitly not cancellable

- **WHEN** an author sets a task step's cancelling control to "not
  cancellable"
- **THEN** the draft's step carries `cancellable: false`

#### Scenario: Returning a step to the inherited default

- **WHEN** an author returns a step's cancelling control from an explicit
  state to "inherit"
- **THEN** the draft's step has no `cancellable` key

#### Scenario: The inherit state names the process's current default

- **WHEN** a step's cancelling control stands in the inherit state and the
  process itself declares `cancellable: false`
- **THEN** the control names the effective outcome as not cancellable

### Requirement: The Collaboration section offers a three-state control per field

The More section SHALL carry a three-state control each for
Comment and Attachments, offering three states: Default, On, and Off.
Selecting Default SHALL clear the step's own override for
that key, so the step reads as `undefined` for it. It then inherits the
process default at once, including any later change to it. Selecting On
or Off SHALL set the step's own override to `true` or `false`. While
Default is the selected state, the control SHALL visibly name the
process-wide default's current resolved value for that key. That value
might read as "Currently: on", for example.

A subprocess step SHALL carry neither control.

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

Each section SHALL print the open issues that belong to it inside its body,
above its controls, as sentences. The header SHALL count them. An issue about
the assignment SHALL stand at Who acts. An issue about a way out SHALL stand
at Ways out, in that way out's row. An issue about the form SHALL stand at
Form.

An issue SHALL stand at exactly one section. The Checks tab SHALL keep listing
every issue, including those a section already prints.

#### Scenario: An unassigned step prints its issue at Assignment

- **WHEN** a task step declares no assignment
- **THEN** the Who acts section prints that issue inside its body

#### Scenario: The Checks tab keeps the same issue

- **WHEN** the Who acts section prints an issue
- **THEN** the Checks tab still lists that issue

#### Scenario: A way out's issue stays at its row

- **WHEN** a check names a way out's guard
- **THEN** the sentence stands at that way out's row inside Ways out
- **AND** the Ways out header counts it once

### Requirement: The step page walks to the previous and the next step

The step page's foot SHALL carry one control that opens the previous step and
one that opens the next step. The order SHALL be the rail's order. Each
control SHALL name the step it opens. A neighbour with no label SHALL read
"(unnamed step)" there, and the control SHALL print no key.

The control SHALL refuse the press at the end of the walk it belongs to.

#### Scenario: The next control names its step

- **WHEN** the next step in the rail carries the label "Credit check"
- **THEN** the next control names "Credit check"

#### Scenario: The last step refuses the next control

- **WHEN** the step page holds the last step in the rail's order
- **THEN** the next control refuses the press

#### Scenario: An unnamed neighbour reads the placeholder

- **WHEN** the next step in the rail has an empty label and the key `review`
- **THEN** the next control reads "Next: (unnamed step)"
- **AND** it does not contain `review`

### Requirement: The step page carries a Developer view of the step

The step page SHALL carry a Developer view disclosure inside the More
section, after the cancelling and collaboration controls. The disclosure
SHALL stand closed until an author opens it. An open disclosure SHALL carry
the step's key input, the step's `id` and the step's own JSON.

<!-- antislop: allow synonym-rotation -->
<!-- Why: "JSON surface" is this codebase's fixed UI-glossary term for the raw definition-editing screen (.claude/rules/ui-glossary.md), not a rotated synonym for a display/show/carry verb used elsewhere in this file. -->
The JSON SHALL be read-only here. The JSON surface stays the one place for
hand-authoring a definition. The key input is the one writable control in
the disclosure.

#### Scenario: The Developer view carries the step's JSON

- **WHEN** an author opens the Developer view disclosure
- **THEN** the disclosure carries that step's JSON
- **AND** the disclosure names the step's `id`

#### Scenario: The Developer view accepts no typing

- **WHEN** an author types into the Developer view's JSON
- **THEN** the draft does not change

#### Scenario: The Developer view stands inside More

- **WHEN** an author opens More
- **THEN** the Developer view disclosure stands last in its body, closed

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

### Requirement: The inputMapping editor offers the child's input fields by label

The `inputMapping` editor in "Which process it calls" SHALL offer the called
process's `contract.inputFields` as its targets. It SHALL offer none of the
calling process's own fields. Each option SHALL print the child field's label
in the child's base locale. It SHALL store its `id` and never print its `key`.

The `outputMapping` editor keeps the calling process's fields.

#### Scenario: A pinned binding lists the child's input fields

- **WHEN** a subprocess step calls "Credit check" pinned at version 2
- **AND** version 2 declares `contract.inputFields` of the fields labelled
  "Amount" and "Applicant", keyed `amount` and `applicant`
- **THEN** the `inputMapping` select offers "Amount" and "Applicant"
- **AND** no option prints `amount` or `applicant`
- **AND** the select offers no field of the calling process

#### Scenario: Opening a valid mapping shows the child field's label

- **WHEN** an author opens a step whose `inputMapping` maps the child field
  labelled "Amount", and the child lists it
- **THEN** the row's select shows "Amount"
- **AND** the stored key stays as it was

### Requirement: The inputMapping editor reads the child's contract from the bound version

The page SHALL read the child's contract from the version the binding names.
That is a `pinned` binding's `pinnedVersion`, or the newest listed version
for `latest-at-spawn`. It SHALL read once per process and version, through
the existing version-body route.

#### Scenario: A latest-at-spawn binding reads the newest version

- **WHEN** a subprocess step calls "Credit check" with `latest-at-spawn` and
  the process list names version 5 as the newest
- **THEN** the editor reads the contract of version 5

### Requirement: The inputMapping editor's add control and note follow the child's list

"+ add" SHALL pick the first child input field no row holds. It SHALL stay
disabled while the list is empty, exhausted, loading or failed. A one-line
note SHALL then say why: loading, failed, no input fields, or every field
has a row. The note SHALL stand in a status region, and the disabled "+ add"
SHALL point at it. Both SHALL read the list the select offers.

#### Scenario: The read fails

- **WHEN** the child's version body fails to load
- **THEN** "+ add" stays disabled
- **AND** a note says the child's input fields could not load
- **AND** every stored `inputMapping` row stays as stored

#### Scenario: Every input field has a row

- **WHEN** the child lists two input fields and the `inputMapping` has a row for
  each
- **THEN** "+ add" stays disabled
- **AND** a status note says every input field has a row

### Requirement: The inputMapping editor keeps every stored key

The editor SHALL keep every stored key as stored. The loaded list of the
child's input fields can lack a stored key. That key SHALL then appear as its
own marked option, which prints the stored id. Before then, a stored key shows
its id without the mark, because the list is unknown. The select therefore
never shows another entry than the stored one.

The author may remove that row or pick a listed field for it.

#### Scenario: A stored key while the list loads

- **WHEN** a row has a stored key and the child's version body is still loading
- **THEN** the row's select shows the stored id without a mark

#### Scenario: A stored key the child no longer lists

- **WHEN** a row has a key that the child's contract does not list
- **THEN** the row's select shows a marked option that prints the stored id
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
