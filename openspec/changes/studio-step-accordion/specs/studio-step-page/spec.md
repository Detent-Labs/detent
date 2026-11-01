<!-- antislop: allow-file passive-voice -->
<!-- Why: a scenario states an outcome, and the actor is the system under test. -->
## REMOVED Requirements

### Requirement: The step page stands its sections open in two columns

**Reason**: The owner decided on 2026-10-30 that the step shows one subject
at a time (decision D3 in `docs/studio-ui-concept.md`). Two columns of open
sections put 83 controls on one task step.

**Migration**: Four requirements carry the rules over. "The step page folds
its sections into one accordion" holds the single column and the fold. "A
step's kind decides its sections" holds the per-kind set. "A section header
carries a summary and its state" and "One section stands open at a time" hold
the rest.

## ADDED Requirements

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

## MODIFIED Requirements

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
