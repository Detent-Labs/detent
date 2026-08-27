<!-- antislop: allow-file passive-voice -->
<!-- The SHALL/WHEN/THEN Gherkin grammar this repo's specs use is structurally passive; see data-retention/spec.md for the same directive and reason. -->

# instance-audit-log

## Purpose

Records every change to an instance's field data as an append-only
entry. The entry names the field, the value, the actor and the write
path. A reader with database access cannot change or delete an entry
without a later verification catching it.

The persistence capability's phrase "the audit-trail relations" means
`history_entries` and `instance_events`. This relation is a third, and
redaction treats it differently.

## Requirements

### Requirement: Every field data change appends an audit entry

The engine SHALL append one entry to the instance audit log for each
field whose value changes in `instances.body.data`. An entry is a delta,
never an instance snapshot. It SHALL carry the instance, a per-instance
sequence and the transition sequence in force. It SHALL also carry the
field id, the operation (`set` or `redact`), and the value the field
holds after the change. An entry SHALL NOT carry the value the field
held before it. The preceding entry for that field is where a reader
finds that.

Creating an instance counts as a change. Data written at creation SHALL
produce one entry per field. That data may come from a start form or
from a catalog default.

A key the old field data holds and the new field data lacks is a change.
It SHALL produce a `set` entry whose value is a JSON null, distinct from
the absent value a redaction leaves behind.

The log SHALL hold the value in clear text. Reading which value a field
used to carry is the log's purpose. No reader needs a key or a
decryption step.

Completeness SHALL NOT depend on a caller. Any statement writing
`instances.body.data` SHALL produce the entries for what it changed.
That holds for a statement added after this capability ships.

#### Scenario: A participant's submission records one entry per changed field

- **WHEN** a submission writes two fields and leaves a third untouched
- **THEN** the log gains two entries, one per written field, each carrying
  the submitted value in clear text

#### Scenario: Instance creation records its seeded values

- **WHEN** an instance is created with start-form data, and a catalog
  default seeds a further field
- **THEN** the log carries one entry per seeded field, and each field's
  first entry holds its first value

#### Scenario: A write that changes no field data appends nothing

- **WHEN** a claim, a release, a timer fire or a status change writes the
  instance row without touching `body.data`
- **THEN** the log gains no entry

#### Scenario: An entry is reachable from the transition that caused it

- **WHEN** a reader holds a history entry's instance and transition
  sequence
- **THEN** the audit entries that transition produced are selectable by
  that same pair

### Requirement: An entry records its actor and its write path

Each entry SHALL carry the acting actor and a source naming the write
path. Six sources exist: instance creation, participant submission,
action writeback, subprocess return, migration and redaction.

An entry whose write path supplied no actor or no source SHALL carry a
null in that column. It SHALL NOT carry a fabricated value. Such an entry
SHALL
still record the field change in full. An operator SHALL be able to
select the null-actor entries. An unattributed write is then visible
rather than silent.

An actor or a source an earlier transaction left on the connection SHALL
count as none supplied. The column
SHALL carry a null there too, never an empty string. The engine holds a
connection pool, so that is the common shape.

#### Scenario: A submission names the submitting actor

- **WHEN** a participant submits a step form
- **THEN** each entry the submission produced names that participant and
  the participant-submission source

#### Scenario: A migration and a submission are distinguishable

- **WHEN** a migration rewrites a field on an instance, and a participant
  later submits a value for the same field
- **THEN** the two entries carry different sources, though both commit
  through the same statement

#### Scenario: An unattributed write is queryable

- **WHEN** a write path supplies no actor
- **THEN** the entry carries a null actor, records the field change, and
  answers an operator query for null-actor entries
- **THEN** a write path supplying no source carries a null source and
  records its field change in full

### Requirement: Entries form a per-instance hash chain

Each entry SHALL carry a fingerprint of its value. Each entry SHALL also
carry a hash covering its own metadata, that fingerprint, and the
preceding entry's hash. An instance's first entry SHALL chain from a
fixed empty value.

Each fingerprint SHALL be salted with a per-entry random salt. The salt
SHALL make a cleared value unrecoverable. Hashing candidate values over
a small value space SHALL NOT recover it.

#### Scenario: A changed entry breaks the chain

- **WHEN** somebody with database access rewrites a stored entry's value
- **THEN** a later verification reports that entry as failing

#### Scenario: A deleted entry breaks the chain

- **WHEN** somebody with database access deletes an entry from the middle
  of an instance's chain
- **THEN** a later verification reports the following entry as failing

#### Scenario: A reordered entry breaks the chain

- **WHEN** somebody with database access swaps the sequence numbers of
  two entries in one instance's chain
- **THEN** a later verification reports the earlier of the two as
  failing

### Requirement: Chain verification names the first failing entry

The engine SHALL expose a verification for one instance's chain. It
SHALL report whether the chain holds. It SHALL name the sequence of the
first failing entry whenever the chain does not hold.

Verification SHALL run inside the database. A caller outside the
database SHALL reach that same verification. It SHALL NOT recompute a
digest of its own.

#### Scenario: An intact chain verifies

- **WHEN** verification runs against an instance whose entries are
  unchanged
- **THEN** it reports the chain as holding, and names no failing sequence

#### Scenario: Verification names the earliest break

- **WHEN** two entries in one chain have been rewritten
- **THEN** verification names the earlier of the two

### Requirement: The application can only append to the audit log

<!-- antislop: allow synonym-rotation -->
<!-- "update" names the SQL privilege here, not a field data change; the two are different concepts. -->
`initSchema` SHALL grant only insert and select on the audit relation to
the role the engine connects as. It SHALL NOT grant update or delete. A
non-superuser role SHALL then be refused both statements. Appending an
entry SHALL be the only write the application's own role can perform
without first assuming the owner role.

Membership in the owner role SHALL NOT by itself confer the owner's
privileges. `initSchema` SHALL grant that membership without
inheritance. A member SHALL reach the owner's privileges only by
assuming the role. An inheriting grant would leave the engine's own role
holding update and delete outright. The paragraph above would then state
nothing true.

Two operations SHALL be the only writers of the log. The first appends
entries for a field data write. The second clears the values of every
field an instance's entries name. Both SHALL reach the log through one
shared append, so the chain has one implementation.

#### Scenario: A direct update from the application is refused

- **WHEN** a non-superuser role with the engine's grants and the
  engine's membership tries to update an audit entry
- **THEN** the database refuses the statement

#### Scenario: A direct delete from the application is refused

- **WHEN** a non-superuser role with the engine's grants and the
  engine's membership tries to delete an audit entry
- **THEN** the database refuses the statement

### Requirement: Redaction clears values across a field's whole history

Redacting an instance SHALL append one `redact` entry per field the
instance's audit log holds an entry for. Each entry SHALL name the
actor, the time and the field. It SHALL also name the reason its caller
supplied, when one was given. A `redact` entry SHALL carry no value and
no salt. Its fingerprint SHALL be the fixed empty one, which
verification skips because the entry carries no salt. Redaction SHALL
then clear the value and the salt of every earlier entry for those
fields on that instance.

Redaction SHALL cover a field's whole history, never one step's value.
Every entry's hash SHALL still verify afterwards. The hash covers the
fingerprint rather than the value.

A cleared entry's fingerprint SHALL NOT be checkable against its value,
which no longer exists. The chain SHALL still show that the entry was
neither inserted, reordered nor rewritten.

#### Scenario: Redacting a field clears its earlier values

- **WHEN** a field carrying three successive values on one instance is
  redacted
- **THEN** all three entries hold no value and no salt. One `redact`
  entry for that field names the actor and the time

#### Scenario: A redacted instance still verifies

- **WHEN** verification runs against an instance whose fields were
  redacted
- **THEN** it reports the chain as holding

#### Scenario: Another instance's entries keep their values

- **WHEN** one instance is redacted
- **THEN** a second instance's entries still carry their values in clear
  text
