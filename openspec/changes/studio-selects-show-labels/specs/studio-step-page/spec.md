## MODIFIED Requirements

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

## ADDED Requirements

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
way-out label can already end with an arrow and that text. The heading SHALL
then print the label alone. The time limit's select SHALL take the studio
select's form and span its column.

#### Scenario: A default way-out label does not repeat its target

- **WHEN** a way out labelled "Prüfung → Capture" leads to the step "Capture"
- **THEN** its row heading reads "Prüfung → Capture"
- **AND** the time limit's select offers "Prüfung → Capture"

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

## REMOVED Requirements

### Requirement: The inputMapping editor offers the child's input fields as keys

**Reason**: Each option printed the child field's key, which principle 2 of stage 64 keeps behind the Developer view.

**Migration**: The requirement "The inputMapping editor offers the child's input fields by label" replaces it. Three more requirements keep its other rules:

- "The inputMapping editor reads the child's contract from the bound version"
- "The inputMapping editor's add control and note follow the child's list"
- "The inputMapping editor keeps every stored key"
