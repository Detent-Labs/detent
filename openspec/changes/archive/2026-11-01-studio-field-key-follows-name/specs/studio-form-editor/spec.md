<!-- antislop: allow-file passive-voice -->
<!-- Why: a scenario states an outcome, and the actor is the system under test. -->
## MODIFIED Requirements

### Requirement: A name given in the form editor sets the key

A label written on a card or in the strip SHALL set the field's key. It
follows the rule of the Fields tab's label control. A field's key follows
the label until a published version holds the field. A key change rewrites
every expression that reads the old key (`studio-app`). The key stays
unique across the whole catalog.

A group's key follows its label the way the Fields tab's group label does,
and no publish locks it. A group's label also rewrites the view entries
naming the group's key.

#### Scenario: A new field's key follows its name

- **WHEN** the author names a new field "Amount"
- **THEN** the field's key reads `amount`

#### Scenario: A taken key gains a number

- **WHEN** the catalog already holds a field with the key `amount`
- **AND** the author names a new field "Amount"
- **THEN** the new field's key reads `amount_2`

#### Scenario: A name given in the form editor takes a guard along

- **WHEN** an unpublished field "Amount" carries the key `amount`
- **AND** a path guard reads `data.amount > 1000.0`
- **AND** the author names the field "Total amount" on its card
- **THEN** the guard reads `data.total_amount > 1000.0`

## ADDED Requirements

### Requirement: A minted field's key passes over a key only an expression reads

The form editor SHALL mint a field's key against the same taken set as the
Fields tab's label control (`studio-app`). A key only an expression reads
counts as taken, and so does a word CEL reads as a literal.

#### Scenario: A minted date beside a dangling guard takes a number

- **WHEN** a path guard reads `data.date` and no field carries `date`
- **AND** the author mints a Date field in the form editor
- **THEN** the new field's key reads `date_2`
- **AND** the guard still reads `data.date`
