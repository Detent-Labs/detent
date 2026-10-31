# Spec Delta

<!-- antislop: allow-file passive-voice synonym-rotation negation-habit -->
<!-- Why: the MODIFIED blocks copy the live requirements word for word, and the live file carries the same directive. -->

## REMOVED Requirements

### Requirement: The step page names its step and renames it in place

**Reason**: The requirement stands the step's key beside its label in the
masthead. Stage 64's principle 2 moves every key into a Developer view, and
two scenarios here state the side-by-side row. The successor below keeps
the kicker, the rename, the first-step mark and the remove control.

**Migration**: Read "The step page names its step and keeps its key in the
Developer view".

### Requirement: The Path to section stands each path's Label and Key side by side

**Reason**: The requirement stands a path's key beside its label. The key
moves into the row's own Developer view, and the row gains a sentence
heading. Its scenarios state the old row, so the requirement goes whole.

**Migration**: Read "A way out reads as a sentence and keeps its key in its
own Developer view".

## ADDED Requirements

### Requirement: The step page names its step and keeps its key in the Developer view

The step page SHALL open with a kicker naming the step's number and its
kind. The step's name SHALL sit under that kicker as a writable line
captioned "Name", at the page's full width. "Description" SHALL follow it.
Typing in the name line SHALL rename the step. The masthead SHALL hold no
key input.

The step's key input SHALL stand inside the Developer view under "Key",
and typing there SHALL write the key. The page SHALL mark the first step
and carry one control that removes the step.

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
name of the target step. An unnamed way out SHALL read "(unnamed way out)" there,
and a way out with no target "(no step yet)". The row's "Name" input and
its "Leads to" select SHALL follow. The row SHALL hold a "Developer view"
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

## MODIFIED Requirements

### Requirement: The step page stands its sections open in two columns

The step page SHALL lay its sections in two columns. No section SHALL
collapse. The leading column SHALL carry Ways out, Who acts, Cancellable,
Which process it calls, and How the case ends. The trailing column SHALL
carry When entered, When left, Time limit, Form, and Collaboration.

A section SHALL stand only where the step's kind declares it. A task step
carries Who acts. A subprocess step carries Which process it calls. An end
step carries How the case ends. It has no way out, so it carries
neither When left nor Time limit.

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
- **THEN** the page carries Ways out, Who acts, Cancellable, When entered,
  When left, Time limit, Form and Collaboration
- **AND** the page has no Which process it calls section

<!-- Why: this heading is what a future MODIFIED delta against this
     requirement will need to match, byte for byte. -->
#### Scenario: An end step carries no outgoing path

- **WHEN** the step page holds an end step
- **THEN** the page carries How the case ends
- **AND** the page has no Ways out section, no When left section, no Time
  limit section and no Cancellable section

#### Scenario: Every section stands open

- **WHEN** an author opens any step on the step page
- **THEN** every section of that step is readable without a press

#### Scenario: A subprocess step has no Collaboration section

- **WHEN** the step page holds a subprocess step
- **THEN** the page carries Which process it calls
- **AND** the page has no Collaboration section

### Requirement: A section prints its own open issues beside its heading

Each section SHALL print the open issues that belong to it, beside its own
heading. An issue about the assignment SHALL stand at Who acts. An issue
about a way out SHALL stand at Ways out. An issue about the form SHALL
stand at Form.

An issue SHALL stand at exactly one section. The Checks tab SHALL keep listing
every issue, including those a section already prints.

#### Scenario: An unassigned step prints its issue at Assignment

- **WHEN** a task step declares no assignment
- **THEN** the Who acts section prints that issue beside its heading

#### Scenario: The Checks tab keeps the same issue

- **WHEN** the Who acts section prints an issue
- **THEN** the Checks tab still lists that issue

### Requirement: The step page carries a Developer view of the step

The step page SHALL carry a Developer view disclosure at its foot. The
disclosure SHALL stand closed until an author opens it. An open disclosure
SHALL carry the step's key input, the step's `id` and the step's own JSON.

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
