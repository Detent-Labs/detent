<!-- antislop: allow-file passive-voice -->
<!-- Why: a scenario states an outcome, and the actor is the system under test. -->
## REMOVED Requirements

### Requirement: The builder re-reads when the operand set changes

**Reason**: A key change now rewrites the source that reads the key. A
guard on a renamed field re-reads as a comparison, never as a raw row.

**Migration**: "The builder re-reads when its source or operand set
changes".

## ADDED Requirements

### Requirement: The builder re-reads when its source or operand set changes

The builder holds its rows while the author works. It SHALL re-read them from
the source whenever the source text or the operand set changes. A resolving
child process changes the operand set and leaves the text as it stands.

The operand set counts as changed when a path or its CEL type changes. A label
alone SHALL NOT count. A label change that moves a key changes a path. Every
open builder then drops its unfinished row.

#### Scenario: A resolving child converts a raw row in place

- **WHEN** a developer opens a guard reading `child.outcome == "approved"` on a
  subprocess step whose child has not resolved
- **AND** the developer then resolves that child
- **THEN** the raw row becomes a comparison row against `child.outcome`
- **AND** the stored source is unchanged, since reading is not an authoring
  action

#### Scenario: A rewritten guard re-reads on the new key

- **WHEN** a guard reading `data.amount > 1000.0` is open
- **AND** the field's key changes to `total`
- **THEN** the row reads as a comparison on that field
- **AND** the stored source reads `data.total > 1000.0`

#### Scenario: A label change that moves no key keeps an unfinished row

- **WHEN** a field's label changes while a row sits incomplete
- **AND** no key changes
- **THEN** the incomplete row is still there, with its operand and operator

### Requirement: A field rename rewrites CEL source through the parsed tree

The studio SHALL rewrite one CEL source for a field key change from `from`
to `to`. It SHALL parse the source and visit every node. A member read of
the identifier `data` with the name `from` SHALL take the name `to`. The
rewrite SHALL replace only the name's own characters, which end where the
node's range ends. Every other character SHALL stay as written, spaces and
parentheses included. A read inside a macro or a call SHALL change like any
other.

#### Scenario: A comparison takes the new key

- **WHEN** a guard reads `data.amount > 1000.0 && data.status == "open"`
- **AND** the field `amount` takes the key `total`
- **THEN** the guard reads `data.total > 1000.0 && data.status == "open"`

#### Scenario: The rest of the text stays as written

- **WHEN** a guard reads `( data . amount  >  5.0 )`
- **AND** the field `amount` takes the key `total`
- **THEN** the guard reads `( data . total  >  5.0 )`

#### Scenario: A read inside a macro or a call changes

- **WHEN** a guard reads `has(data.amount) && size(data.amount) > 0`
- **AND** the field `amount` takes the key `total`
- **THEN** the guard reads `has(data.total) && size(data.total) > 0`

### Requirement: A field rename leaves what is not a field read

A string literal SHALL stay. So SHALL an index read such as `data["from"]`,
a read under `child.data`, and a longer name that starts with `from`.

#### Scenario: A string literal, an index read and a child read stay

- **WHEN** a guard reads
  `"data.amount" == data.note && data["amount"] > 1.0 && child.data.amount > 1.0`
- **AND** the field `amount` takes the key `total`
- **THEN** the guard reads exactly as before

#### Scenario: A longer key that shares the start stays

- **WHEN** a guard reads `data.amount_2 > 1.0`
- **AND** the field `amount` takes the key `total`
- **THEN** the guard still reads `data.amount_2 > 1.0`

### Requirement: Source that does not parse changes by text

Source that does not parse SHALL change by text. Each `data.<from>` on word
boundaries, with no identifier character or dot before `data`, SHALL read
`data.<to>`. The reader count uses that same match, so the rewrite changes
exactly the sources the count counts.

#### Scenario: Source that does not parse changes by text

- **WHEN** a guard reads `data.amount >` and does not parse
- **AND** the field `amount` takes the key `total`
- **THEN** the guard reads `data.total >`

### Requirement: A condition reads as a sentence outside the builder

The studio SHALL read a stored condition as one sentence, for a place that
lists conditions without a builder. The sentence SHALL join the clauses of
the complete rows the way the builder's own sentence does. It SHALL start
with a capital letter and end with a period. A row the builder cannot read
SHALL read as the catalog's phrase for it, never as CEL.

Source that does not parse, and source with no complete row, SHALL read
"A hand-written rule."

#### Scenario: A guard reads in words

- **WHEN** a guard reads `data.amount > 1000.0`
- **AND** the field `amount` carries the label "Amount"
- **THEN** its sentence reads "Amount is greater than 1,000."

#### Scenario: Source that does not parse reads as a hand-written rule

- **WHEN** a guard reads `data.amount >`
- **THEN** its sentence reads "A hand-written rule."
- **AND** the sentence has no `data.`
