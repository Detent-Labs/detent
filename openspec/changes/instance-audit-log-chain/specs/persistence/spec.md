<!-- antislop: allow-file passive-voice -->
<!-- Carries the main spec's own directive and reason: the fixed SHALL/WHEN/THEN Gherkin grammar is structurally passive. -->

## ADDED Requirements

### Requirement: initSchema creates the instance audit relation

`initSchema` SHALL create a relation holding one row per written
instance field. The relation SHALL key on the instance and a per-instance
sequence. It SHALL also carry the transition sequence in force. A reader
can then join it to `history_entries` and `instance_events`.

The relation SHALL carry an index on the instance and its sequence. That
index serves the two reads the capability rests on. The first replays one
instance's entries in order. The second finds its chain head.

#### Scenario: Starting the server creates the audit relation

- **WHEN** `initSchema` runs against an empty database
- **THEN** the audit relation and its index exist

#### Scenario: Starting the server twice leaves the relation alone

- **WHEN** `initSchema` runs against a database that already holds the
  relation and rows
- **THEN** the relation and its rows are unchanged

### Requirement: A trigger populates the audit relation

`initSchema` SHALL create a trigger on `instances` firing after an insert
and after an update. The trigger SHALL compare the old and new field data
and write one row per field whose value differs.

The trigger SHALL run under a privilege the application's own role does
not hold. It SHALL read the acting actor and the write path from
transaction-scoped settings. It SHALL write a null actor when a setting
is absent.

This is the schema's first trigger and its first function running under a
definer's privilege. Both are created idempotently, so a second
`initSchema` replaces them rather than failing.

#### Scenario: Starting the server creates the trigger

- **WHEN** `initSchema` runs against an empty database
- **THEN** the trigger and its function exist on `instances`

#### Scenario: An insert of instance data writes audit rows

- **WHEN** a row is inserted into `instances` with two fields in its data
- **THEN** the audit relation gains two rows

#### Scenario: An update touching no field data writes no audit row

- **WHEN** an `instances` row is updated without changing its field data
- **THEN** the audit relation gains no row

### Requirement: The audit relation is append-only for the application

`initSchema` SHALL revoke update and delete on the audit relation from
the role the engine connects as. Insert SHALL stay, so the trigger's own
writes still land.

Redacting the values of named fields SHALL run under a definer's
privilege, the same way the trigger does. These two SHALL be the only
paths that write the relation.

#### Scenario: The application role cannot update an audit row

- **WHEN** the engine's own role issues an update statement against the
  audit relation
- **THEN** the database refuses the statement

#### Scenario: The application role cannot delete an audit row

- **WHEN** the engine's own role issues a delete against the audit
  relation
- **THEN** the database refuses the statement

### Requirement: Chain verification is a database function

`initSchema` SHALL create a function verifying one instance's audit
chain. The function SHALL walk the instance's rows in sequence order and
recompute each row's hash.

Verification SHALL live in the database rather than in the engine's
TypeScript. The hash covers the database's own rendering of a value. A
second implementation would have to reproduce that rendering exactly.

#### Scenario: Starting the server creates the verification function

- **WHEN** `initSchema` runs against an empty database
- **THEN** the verification function exists

#### Scenario: Verification reads an untampered chain as holding

- **WHEN** the function runs against an instance whose rows the trigger
  alone wrote
- **THEN** it reports the chain as holding
