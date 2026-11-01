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

### Requirement: Every step, way-out and field select on the step page lists labels

A select on the step page can list steps, ways out or fields. Each such
select SHALL print every option in the author's words. No option SHALL print a step key, a
way-out key, a field key or an id, with one exception below. The rule covers
six selects:

- the way out's "Leads to" select and the select "Where the new way out
  leads", which list steps;
- the time limit's select "The way out it takes when it runs out", which
  lists the step's own ways out;
- the field-map selects of two output mappings, an action's and a called
  process's, which list the calling process's fields;
- the field-map select of a called process's input mapping, which lists the
  called process's input fields.

A step SHALL read its label at the content locale, else at the base locale.
An empty one SHALL read "(unnamed step)". A way out SHALL read its row
heading, such as "Approve → Done".

A field of the calling process SHALL
read its label the same way as a step. An empty one SHALL read "(unnamed
field)". A called process's field SHALL read its label in that
process's base locale. A group field SHALL appear in no field-map select.

Two options in one select can share a text. The second and later SHALL then
add a count, such as "Review (2)", in list order. The condition builder's operand
picker follows the same count rule. A way-out heading SHALL name its target
with the same counted text the step select prints.

The options SHALL keep the draft's order. Each option SHALL still store the
entity's `id`.

A field-map row whose stored id names no listed field is the one exception.
Its option SHALL print the stored id with the "(no longer listed)" mark,
because no label names it.

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

#### Scenario: Two steps sharing a label stay apart

- **WHEN** a draft holds two steps both labelled "Review"
- **THEN** both step selects offer "Review" and "Review (2)", in draft order
- **AND** a way out leading to the second step heads its row with
  "Review (2)"

#### Scenario: The time limit lists ways out by their heading

- **WHEN** a step carries a way out labelled "Freigeben" leading to
  "Abschluss", with the key `pr-fung-abschluss`
- **THEN** the time limit's way-out select offers "Freigeben → Abschluss"
- **AND** no option reads `pr-fung-abschluss`

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
- **THEN** the row's select shows that id with the "(no longer listed)" mark

### Requirement: The inputMapping editor offers the child's input fields by label

The `inputMapping` editor in "Which process it calls" SHALL offer the called
process's `contract.inputFields` as its targets. It SHALL offer none of the
calling process's own fields. Each option SHALL print the child field's label
in the child's base locale and store the child field's `id`. No option SHALL
print the child field's `key`.

The step page SHALL read the child's contract from the body of the version the
binding names. A `pinned` binding names its `pinnedVersion`. A
`latest-at-spawn` binding names the newest version in the process list. The
page SHALL read once per process and version, through the studio's existing
version-body route.

"+ add" SHALL pick the first child input field that no row holds. It SHALL
stay disabled while the list is empty, exhausted, loading or failed. While the
read loads or after it fails, a one-line note SHALL say so.

A child with no
`contract` or no `inputFields` SHALL get a note saying it declares no input
fields. A child whose input fields all have a row SHALL get a note saying every
input field has a row. The note region SHALL be a status region. The disabled
"+ add" SHALL point at the note.

The editor SHALL keep every stored key as stored. The loaded list of the
child's input fields can lack a stored key. That key SHALL then appear as its
own marked option, which prints the stored id. Before then, a stored key shows
its id without the mark, because the list is unknown. The select therefore
never shows another entry than the stored one.

The author may remove that row or pick a listed field for it. The `outputMapping` editor keeps the calling
process's fields as targets.

#### Scenario: A pinned binding lists the child's input fields

- **WHEN** a subprocess step calls "Credit check" pinned at version 2
- **AND** version 2 declares `contract.inputFields` of the fields labelled
  "Amount" and "Applicant", keyed `amount` and `applicant`
- **THEN** the `inputMapping` select offers "Amount" and "Applicant"
- **AND** no option prints `amount` or `applicant`
- **AND** the select offers no field of the calling process

#### Scenario: A latest-at-spawn binding reads the newest version

- **WHEN** a subprocess step calls "Credit check" with `latest-at-spawn` and
  the process list names version 5 as the newest
- **THEN** the editor reads the contract of version 5

#### Scenario: Opening a valid mapping shows the child field's label

- **WHEN** an author opens a step whose `inputMapping` maps the child field
  labelled "Amount", and the child lists it
- **THEN** the row's select shows "Amount"
- **AND** the stored key stays as it was

#### Scenario: The read fails

- **WHEN** the child's version body fails to load
- **THEN** "+ add" stays disabled
- **AND** a note says the child's input fields could not load
- **AND** every stored `inputMapping` row stays as stored

#### Scenario: A stored key while the list loads

- **WHEN** a row has a stored key and the child's version body is still loading
- **THEN** the row's select shows the stored id without a mark

#### Scenario: Every input field has a row

- **WHEN** the child lists two input fields and the `inputMapping` has a row for
  each
- **THEN** "+ add" stays disabled
- **AND** a status note says every input field has a row

#### Scenario: A stored key the child no longer lists

- **WHEN** a row has a key that the child's contract does not list
- **THEN** the row's select shows a marked option that prints the stored id
- **AND** the row stays until the author changes or removes it

## REMOVED Requirements

### Requirement: The inputMapping editor offers the child's input fields as keys

**Reason**: Each option printed the child field's key, which principle 2 of stage 64 keeps behind the Developer view.

**Migration**: The requirement "The inputMapping editor offers the child's input fields by label" replaces it. It keeps the same rules and prints labels.
