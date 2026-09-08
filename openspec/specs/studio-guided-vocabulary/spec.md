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

- **WHEN** an author opens the control that adds a step
- **THEN** the three entries name a step someone works, a call to another
  process, and an end

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
