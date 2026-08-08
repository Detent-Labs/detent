<!-- antislop: allow-file passive-voice -->
<!-- Why passive-voice: a scenario states an outcome, and the actor is the
     system under test. Matches this capability's own live spec. -->
## RENAMED Requirements

- FROM: `### Requirement: The rule editor uses the studio's CEL expression input`
- TO: `### Requirement: The rule editor uses a structured row builder, with a CEL escape hatch`

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
text input. This covers an expression the builder cannot represent as
rows. It also covers an author who wants to write CEL directly.

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

#### Scenario: A hand-written rule opens in the builder

- **WHEN** an author opens a `rule` a person typed by hand as
  `data.amount > 0.0`
- **THEN** the builder shows it as a row, not raw CEL

#### Scenario: An unbuildable rule opens in "Developer view"

- **WHEN** an author opens a `rule` the builder cannot represent as rows
- **THEN** the "Developer view" disclosure holds the raw CEL text, and
  the row builder shows no row for that fragment

#### Scenario: A rule that does not type-check is unchanged by this requirement

- **WHEN** an author enters a rule referencing a field the catalog does
  not declare
- **THEN** the draft's existing issue list reports it, the same as
  before this change
