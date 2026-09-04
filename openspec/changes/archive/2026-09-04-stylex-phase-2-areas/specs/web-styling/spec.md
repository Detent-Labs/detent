## MODIFIED Requirements

### Requirement: A DOM-attribute variant becomes a code-side style choice

A hand-written stylesheet once picked a layout via a `data-*` attribute
selector. Once migrated, the component's own code SHALL pick among named
StyleX styles instead. The component MAY still render the same `data-*`
attribute as a plain fact. A test or another consumer can read it. No
compiled or hand-written stylesheet SHALL select on it after migration.

This does not extend a component's public props. The component decides
which named style applies. It reads a value it already computes. A
caller passes nothing new to get this.

An open-ended value has no fixed small set of outcomes at the type level.
It SHALL pick its style from a typed lookup instead of a ternary chain.
The lookup's key type SHALL name the exact values the migrated stylesheet
enumerated.

A value the lookup does not name SHALL fall back to a named neutral
style. Neither a throw nor a blank result is acceptable. This preserves
the CSS cascade behavior a hand-written stylesheet already had. There, an
unmatched class-name suffix fell through to its base rule, with no color
and no error.

#### Scenario: A two-way layout switch compiles from two named styles

- **WHEN** a migrated component has a layout property with two known
  outcomes
- **THEN** the build's compiled stylesheet contains a style for each
  outcome, and the component's own code picks between them
- **AND** no rule in the compiled stylesheet names a `data-*` attribute
  selector as its key

#### Scenario: The DOM attribute survives as a plain fact, unread by any stylesheet

- **WHEN** a migrated component still renders the `data-*` attribute that
  used to drive its styling
- **THEN** the attribute's value matches what the component's own style
  choice used to select the same layout
- **AND** no compiled or hand-written rule in the bundle selects on it

#### Scenario: An open-ended value picks its style from a typed lookup

- **WHEN** a migrated component's style depends on a status or kind value
  with more than two possible outcomes
- **THEN** the component reads its style from a `Record` keyed on that
  value's known members, applied through `stylex.props`

#### Scenario: An unmapped value falls back to the neutral style

- **WHEN** the value at hand is not a key the lookup declares
- **THEN** the component applies the lookup's own named neutral style
- **AND** no error reaches the console

## ADDED Requirements

### Requirement: A shared class stays literal until its last consumer migrates

A class name with call sites across more than one migration phase SHALL
stay a literal, unhashed class name. It stays literal until the phase
that converts its last remaining consumer. An earlier phase SHALL NOT
compile a style for that class. A compiled style hashes to a
call-site-scoped class name. It produces no reusable literal selector
another, unmigrated file can reference.

A migrated element may still carry such a class alongside a newly
compiled one. It SHALL compose the two through plain string
concatenation instead. The literal class name comes first, then the
compiled style's own class name. `stylex.props` composes style objects
with each other. It does not accept a literal string as one of its
arguments.

#### Scenario: An unconverted consumer keeps working

- **WHEN** a phase migrates some, but not all, of a shared class's call
  sites
- **THEN** the class's rule stays in its stylesheet, unhashed
- **AND** every call site this phase does not touch keeps rendering with
  that rule

#### Scenario: A migrated element composes a literal class with a compiled one

- **WHEN** a migrated element still carries a deferred literal class
  alongside its own newly compiled style
- **THEN** its rendered class attribute carries both: the literal class
  name, and the compiled style's own class name

### Requirement: A phase verifies an unproven compiler feature against a real build first

A migration phase may be the first to rely on a StyleX feature no earlier
phase exercised. That phase SHALL verify the feature against a real
build, immediately after writing it. No later task in that phase SHALL
assume the feature works before that check runs.

A feature may not compile or behave as expected. It then SHALL fall back
to a literal, unhashed residual rule. That rule lives in a small residual
stylesheet, the same fallback a two-class exception already uses
elsewhere in this spec.

#### Scenario: A phase checks a first-use feature before later work depends on it

- **WHEN** a phase's design names a StyleX feature no earlier phase used
- **THEN** the task that writes it also reads the compiled output, or
  exercises the feature in a browser
- **AND** it does this before any later task in that phase assumes the
  feature works

#### Scenario: A failed feature falls back to a literal rule

- **WHEN** the check in the scenario above finds the feature does not
  compile or behave as designed
- **THEN** the affected rule becomes a literal, unhashed class instead
- **AND** no later task in that phase depends on the original mechanism
