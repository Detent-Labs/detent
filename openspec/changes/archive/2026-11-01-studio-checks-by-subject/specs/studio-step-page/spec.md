# Spec Delta

## ADDED Requirements

### Requirement: The steps rail keeps the current row in view

When the current step changes, the steps rail SHALL scroll that row into view,
by the least distance.

#### Scenario: A Fix landing shows its row

- **WHEN** a Fix control opens a step whose rail row sits past the rail's
  capped height, below 64rem
- **THEN** that row stands whole in the rail's view

### Requirement: A failed child file load raises an alert

A failed load of a called process's file on a subprocess step SHALL print its
message with `role="alert"`.

#### Scenario: A bad file reports

- **WHEN** an author picks a file with no process definition in it
- **THEN** the message stands under the file control with `role="alert"`

## MODIFIED Requirements

### Requirement: The rail reorders steps and adds new ones

Each rail row SHALL carry a grip that drags it to any position in the list.
A drop SHALL move that step to the dropped position in the draft. Each row SHALL also
answer a move-earlier and a move-later command from the keyboard. That holds
whenever an author focuses its grip.

The capability `spa-accessibility` already requires this. A list offering a
drag move answers that same move from the keyboard, in the list itself. The first row
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

#### Scenario: Adding a step focuses its name

- **WHEN** an author presses an add control in the rail's foot
- **THEN** keyboard focus stands in the new step's Name input

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

#### Scenario: A name check stands under the name

- **WHEN** the step's label has no base-locale entry
- **THEN** one sentence stands directly under the name line
- **AND** it names no validator

### Requirement: The step page carries a Developer view of the step

The step page SHALL carry a Developer view disclosure inside the More
section, after the cancelling and collaboration controls. The disclosure
SHALL stand closed until an author opens it, or until a check names the
step's key. An open disclosure SHALL carry
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

#### Scenario: A key check opens the Developer view

- **WHEN** a check names the step's key
- **THEN** More's Developer view stands open, with the key input in view
- **AND** an author may still close it

### Requirement: A section prints its own open issues beside its heading

Each section SHALL print the open issues that belong to it inside its body,
above its controls, as sentences. The header SHALL count them. An issue about
the assignment SHALL stand at Who acts. An issue about a way out SHALL stand
at Ways out, in that way out's row. An issue about the form SHALL stand at
Form. An issue about the step's key SHALL stand at More.

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

#### Scenario: A removed target reads as removed

- **WHEN** a way out names a step the draft no longer holds
- **THEN** its heading and its Leads to select read "(step removed)"
- **AND** the select holds that as a disabled choice
- **AND** picking a step writes it
