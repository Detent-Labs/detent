# studio-guided-vocabulary Specification

## Purpose

The words an authoring control prints belong to the author, not to the JSON.
This capability holds the plain-language layer over the definition contract.
It also holds the rule that one concept keeps one word on every surface.

## Requirements

### Requirement: One module words one concept for every surface

A concept an author meets SHALL take its word from one module. Two surfaces
SHALL NOT word one concept differently. The field kinds already follow this
rule through their own label function. Every concept named below SHALL follow
it too.

The module SHALL read every word from the string catalog on each call. A
deployment's stored override SHALL therefore reach the word, the same way it
reaches a field kind's name today.

This layer words what a surface prints. It SHALL NOT rename anything in the
draft model. The `performedBy` module keeps its name, and a path's `guard`
keeps its name. A model rename is a separate decision with its own cost.

#### Scenario: Two surfaces print one word

- **WHEN** the step page and the canvas both name a step's assignment
- **THEN** both print the same word for it

#### Scenario: An override reaches the word

- **WHEN** a deployment overrides the catalog key for an assignment strategy
- **THEN** every surface naming that strategy prints the override

### Requirement: An assignment strategy reads as a name and a note

A registered assignment strategy SHALL print a plain name and a short note,
not its registry type. The note SHALL say who ends up able to act on the step.

A strategy the curated table does not name SHALL fall back to its registry
type. That fallback is a machine value, so it SHALL take the mono face.

#### Scenario: A registered strategy prints its plain name

- **WHEN** a step declares the `org.manager-of-starter` strategy
- **THEN** the Assignment section names the starter's manager
- **AND** a note under it says the directory resolves that person at entry

#### Scenario: An unnamed strategy falls back to its type

- **WHEN** a step declares a registered strategy the curated table does not name
- **THEN** the Assignment section prints that registry type in the mono face

### Requirement: A step's kind reads as a plain phrase

A step SHALL name its kind in plain words. A task step reads as a step someone
works. A subprocess step reads as a call to another process. A terminal step
reads as an end.

The word `terminal` SHALL NOT reach an authoring surface. The performed-by
control SHALL take the same three phrases.

#### Scenario: A terminal step reads as an end

- **WHEN** a step declares `terminal: true`
- **THEN** every surface naming its kind prints "End"
- **AND** no surface prints "terminal"

#### Scenario: The add control names what it adds

- **WHEN** an author opens the canvas bar's menu
- **THEN** its two entries name a call to another process, and an end
- **AND** the bar's own button, beside it, adds a step someone works

### Requirement: A time limit reads as a number and a unit

A timer carrying a duration SHALL read as a number and a unit an author picks.
The units SHALL be hours, days and weeks. The surface SHALL write the ISO-8601
duration the contract requires.

The control SHALL bound the number it accepts. The entry instant plus the time
limit SHALL stay inside the four-digit-year window. The publish check SHALL
refuse a value the control still accepts.

A duration the number-and-unit pair cannot state SHALL keep its written form.
The surface SHALL print that form in the mono face and SHALL NOT lose it.

#### Scenario: A duration reads as a number and a unit

- **WHEN** a step's timer declares `PT72H`
- **THEN** the Time limit section reads three days

#### Scenario: The control bounds its own number

- **WHEN** an author types a number carrying the entry instant past the
  four-digit-year window
- **THEN** the control refuses that number

#### Scenario: The publish check backs the control up

- **WHEN** a draft holds a duration the control accepted and the window cannot
  hold
- **THEN** the publish check refuses that draft

#### Scenario: An unrepresentable duration keeps its written form

- **WHEN** a step's timer declares `P1DT4H30M`
- **THEN** the Time limit section prints that duration in the mono face
- **AND** saving the step leaves the duration as it stands

### Requirement: A subprocess step picks a process, never an id

A subprocess step SHALL name the process it calls through a picker over the
processes an author may call. The picker SHALL print each process's label. No
authoring surface SHALL ask an author to type a `proc_` id.

The version binding SHALL read as two plain choices. One pins the called
version. The other takes the newest version whose contract still matches the
one this step validated against. A contract change starts a new signature, so
that choice keeps the last matching version.

#### Scenario: The picker lists process labels

- **WHEN** an author opens the process picker on a subprocess step
- **THEN** each entry prints a process label
- **AND** no entry prints a raw `proc_` id

#### Scenario: The binding reads as two choices

- **WHEN** an author reads a subprocess step's binding control
- **THEN** one choice pins the version
- **AND** the other takes the newest version whose contract still matches
- **AND** the control states that a contract change holds the binding back

### Requirement: The contract's own word stays one disclosure away

Every plain word SHALL have a Developer view that carries the contract's own
word. The step page's disclosure SHALL carry the step's JSON. The condition
sites SHALL keep their own CEL disclosure.

Replacing a word SHALL NOT remove the contract's word from the studio. An
author who needs the JSON term SHALL always reach it without leaving the
surface.

#### Scenario: The JSON carries the contract's word

- **WHEN** the Assignment section names the starter's manager
- **AND** an author opens the step page's Developer view
- **THEN** the JSON there carries `org.manager-of-starter`

#### Scenario: A condition keeps its CEL disclosure

- **WHEN** a path's guard reads as a plain sentence
- **THEN** the CEL disclosure at that site still carries the written source

### Requirement: An authoring control prints the author's word for a contract concept

An authoring control SHALL print the author's word for a contract concept
the vocabulary table names. The contract's own word SHALL stand only inside
a Developer view. A surface the table reaches SHALL NOT print the contract
word as a caption, a heading or a legend. It SHALL NOT print it as a column
heading or a property word either.

#### Scenario: The step page's sections read the table

- **WHEN** an author opens a task step on the step page
- **THEN** its sections read Who acts, Form, Ways out, Time limit, When
  entered or left and More
- **AND** no section heading reads Path to, Assignment, On entry, On exit or
  Cancellable

#### Scenario: A way out's controls read the table

<!-- Why: "How it is taken" quotes the catalog value word for word; the passive is the UI string, not this sentence. -->
<!-- antislop: allow passive-voice -->
- **WHEN** an author opens a way out whose trigger is automatic
- **THEN** the trigger control reads "How it is taken" with the choices "A
  person chooses" and "Happens by itself"
- **AND** the priority caption reads "Tried in this order, lowest first"

#### Scenario: The Paths tab and the Changes tab read the same words

<!-- Why: "How it is taken" quotes the catalog value word for word; the passive is the UI string, not this sentence. -->
<!-- antislop: allow passive-voice -->
- **WHEN** an author opens the Paths tab, and then a changed path's row on
  the Changes tab
- **THEN** both print "Only if" for the guard and "How it is taken" for the
  trigger

#### Scenario: The guard heading reads Only if on every tab

- **WHEN** an author opens a way out on the step page and on the canvas
- **THEN** both name its guard "Only if"
- **AND** no heading reads "Only when"

#### Scenario: The Checks tab states severity in words

- **WHEN** an author reads the Checks tab
- **THEN** a row reads Must fix or Worth a look
- **AND** no row reads blocker, advisory or a validator's name

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
| contract | what this process takes in and gives back |
| options / option value | choices / a choice's stored value |
| `db.list` / `instance.query` / `static` | a data list an operator keeps / cases of another process / a list typed into this process |

#### Scenario: The contract reads as what the process takes in and gives back

- **WHEN** an author reads the Settings tab's sub-row
- **THEN** the contract's view reads "What it takes in and gives back"
- **AND** the change list's contract group reads the same words

#### Scenario: The glossary carries the remaining rows

- **WHEN** a reader compares these rows with the glossary's table
- **THEN** every row stands in the glossary

### Requirement: A data source kind reads as a name

A registered data source type SHALL print a plain name in the kind picker.
The type `db.list` reads "A data list an operator keeps". The type
`instance.query` reads "Cases of another process". The type `static` reads
"A list typed into this process". A type the curated table does not name SHALL
fall back to its registry type.

#### Scenario: A registered kind prints its name

- **WHEN** an author opens the kind picker on a data source
- **THEN** it offers "A data list an operator keeps", "Cases of another
  process" and "A list typed into this process"
- **AND** no entry reads `db.list`, `instance.query` or `static`

#### Scenario: An unnamed kind falls back to its type

- **WHEN** the registry reports a data source type the table does not name
- **THEN** the picker prints that registry type


### Requirement: A field's choices read as choices

An authoring control SHALL call a field's `options` its choices. A choice
SHALL print by its name. Its stored `value` SHALL stand only in a Developer
view, in the mono face, captioned "Stored value".

#### Scenario: The field card names choices

- **WHEN** an author opens a field carrying `options`
- **THEN** the section reads "Choices" and its add control "+ Add a choice"
- **AND** no caption reads `options` or `value`


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
Those surfaces are the field card's Asked on section and the form editor's
strip and card marks. The Forms tab's legend counts too. So do the field
matrix's checkbox names, its bulk badges and its legend. No two of them SHALL print one flag under two
names.

#### Scenario: The Fields tab and the form editor agree on Required

- **WHEN** an author reads a field's Asked on rows and its requiredness
  checkbox
- **AND** then reads that field's strip in the form editor
- **THEN** both print "Required" for the `required` flag

#### Scenario: The matrix legend prints the strip's words

- **WHEN** an author reads the field matrix's color legend
- **THEN** its three swatches read Asked, Required and Read-only

#### Scenario: The matrix badges print the strip's words

- **WHEN** an author reads a column header's bulk badges
- **THEN** they read Asked, Required and Read-only
