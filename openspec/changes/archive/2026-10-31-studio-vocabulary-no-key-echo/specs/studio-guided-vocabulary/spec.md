# Spec Delta

<!-- antislop: allow-file passive-voice -->
<!-- Why: the file quotes the catalog value "How it is taken" word for word, in a table and in bullets. -->

## ADDED Requirements

### Requirement: An authoring control prints the author's word for a contract concept

An authoring control SHALL print the author's word for a contract concept
the vocabulary table names. The contract's own word SHALL stand only inside
a Developer view. A surface the table reaches SHALL NOT print the contract
word as a caption, a heading or a legend. It SHALL NOT print it as a column
heading or a property word either.

#### Scenario: The step page's sections read the table

- **WHEN** an author opens a task step on the step page
- **THEN** its sections read Ways out, Who acts, When entered and When left
- **AND** no section heading reads Path to, Assignment, On entry or On exit

#### Scenario: A way out's controls read the table

- **WHEN** an author opens a way out whose trigger is automatic
- **THEN** the trigger control reads "How it is taken" with the choices "A
  person chooses" and "Happens by itself"
- **AND** the priority caption reads "Tried in this order, lowest first"

#### Scenario: The Paths tab and the Changes tab read the same words

- **WHEN** an author opens the Paths tab, and then a changed path's row on
  the Changes tab
- **THEN** both print "Only if" for the guard and "How it is taken" for the
  trigger

### Requirement: The vocabulary table words a step's own concepts

The rows below are the vocabulary for what a step declares.
`.claude/rules/ui-glossary.md` SHALL carry the same rows.

| Contract word | Author's word |
|---|---|
| path | way out |
| guard | only if |
| trigger manual / automatic | A person chooses / Happens by itself |
| priority | tried in this order |
| assignment | who acts |
| timer | time limit |
| onEntry / onExit actions | what happens when entered / when left |

#### Scenario: The glossary carries the step rows

- **WHEN** a reader compares these rows with the glossary's table
- **THEN** every row stands in the glossary

### Requirement: The vocabulary table words kinds, sources, outcomes and flags

The rows below complete the vocabulary. `.claude/rules/ui-glossary.md`
SHALL carry the same rows.

| Contract word | Author's word |
|---|---|
| terminal step | an end |
| subprocess step | a call to another process |
| data source | where values come from |
| outcome | how it ended |
| required / readonly / visible | Required / Read-only / Asked |

#### Scenario: The glossary carries the remaining rows

- **WHEN** a reader compares these rows with the glossary's table
- **THEN** every row stands in the glossary

### Requirement: A caption prints no JSON property name

A caption, a legend or a field label on an authoring surface SHALL print its
catalog words alone. It SHALL NOT append the JSON property the control
writes, in the mono face or in any other face. It SHALL NOT be the property
name itself. The property name reaches an author only inside a Developer
view, in the JSON there or beside a key input.

#### Scenario: An automatic way out's priority caption has no property

- **WHEN** an author opens an automatic way out
- **THEN** the priority caption reads its catalog words
- **AND** no `code` element carrying `priority` follows them

#### Scenario: The masthead's captions are words

- **WHEN** an author opens a step on the step page
- **THEN** the name line's caption reads "Name" and the description's reads
  "Description"
- **AND** no caption on the page reads `label`, `key` or `description`

#### Scenario: The form editor's strip captions are words

- **WHEN** an author selects a placed field in the form editor
- **THEN** the strip's captions read Asked, Required, Read-only and Width
- **AND** none reads `visible`, `required`, `readonly` or `span`

### Requirement: Each view flag keeps one name on every surface

The `required` flag SHALL read "Required", the `readonly` flag "Read-only"
and the `visible` flag "Asked" on every authoring surface that names one.
Those surfaces are the Fields tab's effect half, the form editor's strip
and card marks, and the Forms tab's legend. The field matrix's checkbox
names and legend count too. No two of them SHALL print one flag under two
names.

#### Scenario: The Fields tab and the form editor agree on Required

- **WHEN** an author reads a field's "Ask for this" checkbox
- **AND** then reads that field's strip in the form editor
- **THEN** both print "Required" for the `required` flag

#### Scenario: The matrix legend prints the strip's words

- **WHEN** an author reads the field matrix's color legend
- **THEN** its three swatches read Asked, Required and Read-only
