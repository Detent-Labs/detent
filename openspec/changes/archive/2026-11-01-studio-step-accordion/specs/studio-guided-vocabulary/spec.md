<!-- antislop: allow-file passive-voice -->
<!-- Why: a scenario states an outcome, and the actor is the system under test. -->
## MODIFIED Requirements

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
