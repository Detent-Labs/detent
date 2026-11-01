# Spec Delta

## ADDED Requirements

### Requirement: The rule builder reads as a sentence

Under its rows the rule builder SHALL print the rule as one sentence, in
the note style. A condition site does the same. The sentence SHALL join the
complete rows' clauses by "and". A row comparing against another field
SHALL name that field by its label as the value. With no row and nothing
stored it SHALL read "No rule yet: every answer passes." No "Writes" readout
and no CEL SHALL print outside the Developer view.

#### Scenario: A rule reads in words

- **WHEN** an author's rule compares "this answer" as "at least" `1000` on
  the field "Amount"
- **THEN** the sentence reads "This answer is at least 1,000."

#### Scenario: A field comparison names the other field

- **WHEN** a row compares "this answer" as "at most" the field "Budget"
- **THEN** the sentence reads "This answer is at most Budget."

#### Scenario: No rule reads as every answer passing

- **WHEN** a field has no `validation.rule` and the builder has no row
- **THEN** the sentence reads "No rule yet: every answer passes."
- **AND** no "Writes" readout prints

### Requirement: The rule builder's other-field picker numbers repeated labels

The "another field" operand list SHALL number a second and later field that
shares a label. It counts in catalog order, as "Name (2)". "this answer" SHALL stay
first and take no count.

#### Scenario: Two fields sharing a label stay apart

- **WHEN** the catalog declares two other fields both labelled "Name"
- **THEN** the picker offers "Name" and "Name (2)"

## MODIFIED Requirements

### Requirement: The rule editor uses a structured row builder, with a CEL escape hatch

The `rule` key SHALL use a row builder as its default editor. A row
compares an operand against a literal or another field. The operand
defaults to "this answer," which SHALL compile to `data.<key>`, naming
the field's own catalog key. More rows join by "and."

The "another field" operand list SHALL filter to fields whose `celType`
matches the row's left operand. This narrowly reopens stage 27b's
deferred field-against-field comparison, scoped to `validation.rule`
alone; `ConditionBuilder` and its own sites keep their literal-only
`value`.

The builder SHALL write `{ lang: "cel", src }`, the same shape the raw
input wrote before this change. It reuses `ConditionBuilder`'s
parse-back approach. It reads the stored `rule` back into rows. It
falls back to a raw row when a fragment does not fit the row model.

The builder SHALL keep a "Developer view" disclosure holding the CEL
text input. It SHALL stand closed on open, except over source that does not
parse. It
SHALL stand under the sentence, the shape every condition site takes, with
no toggle that replaces the rows. This covers an expression the builder
cannot represent as rows. It also covers an author who wants to write CEL
directly.

<!-- antislop: allow trailing-negation -->
<!-- Why: copied byte for byte from the live requirement. -->
This requirement SHALL NOT depend on the condition builder of stage 27b
remaining a single component. A shared implementation is an internal
detail, not a contract.

This change does not touch `checkConstraints`, `evalGuard`, or
`buildGuardContext`. A rule the builder writes evaluates exactly as a
hand-written one would.

#### Scenario: An author writes a rule through the builder

- **WHEN** an author adds a row comparing "this answer" as "at least"
  `1000` on a `number` field
- **THEN** the saved body carries `validation.rule` as
  `{ lang: "cel", src: "data.amount >= 1000.0" }`, naming that field's
  own key

<!-- antislop: allow trailing-negation -->
<!-- Why: copied byte for byte from the live scenario. -->
#### Scenario: A hand-written rule opens in the builder

- **WHEN** an author opens a `rule` a person typed by hand as
  `data.amount > 0.0`
<!-- antislop: allow trailing-negation -->
- **THEN** the builder shows it as a row, not raw CEL

#### Scenario: An unbuildable rule opens in "Developer view"

- **WHEN** an author opens a `rule` the builder cannot represent as rows
- **THEN** the "Developer view" disclosure stands open and holds the raw
  CEL text
- **AND** the row builder shows no row for that fragment

#### Scenario: A rule that fails type-check reports the same as before this change

- **WHEN** an author enters a rule referencing a field the catalog does
  not declare
- **THEN** the draft's existing issue list reports it, the same as
  before this change
