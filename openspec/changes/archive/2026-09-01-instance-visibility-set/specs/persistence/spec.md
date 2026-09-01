<!-- antislop: allow-file passive-voice -->
<!-- Every scenario here uses the fixed SHALL/WHEN/THEN Gherkin grammar the
     rest of this repo's specs use (see data-retention/spec.md's own
     allow-file passive-voice for the same reason). That grammar is
     structurally passive ("WHEN X is called", "THEN Y is deleted");
     rewriting it to dodge the rule would break the required Scenario
     format. -->

## ADDED Requirements

### Requirement: initSchema creates the instance principals relation

`initSchema` SHALL create a relation holding one row per instance and principal,
per the `instance-visibility-set` capability. Its key SHALL be the instance and
the principal together, so a repeated append writes no second row.

The relation SHALL carry the instance list's ordering key alongside the
principal. That key already lives on the instance row. This relation duplicates
it because the read pages by it while filtering on the principal. No index
spans two relations.

The relation SHALL carry no foreign key to `instances`. No per-instance
relation in this schema carries one, and adding one here would break the
`TRUNCATE` every DB-backed test runs. Nothing deletes an instance row, so no
orphan arises; redaction deletes these rows explicitly instead.

The statements SHALL be idempotent, the way every other `initSchema` statement
is. A run against a database that already holds the relation is a no-op.

#### Scenario: A fresh database gets the relation

- **WHEN** `initSchema` runs against an empty database
- **THEN** the instance principals relation exists

#### Scenario: A second run changes nothing

- **WHEN** `initSchema` runs against a database that already holds the relation
- **THEN** the run succeeds and the relation is unchanged

#### Scenario: The same principal cannot be stored twice for one instance

- **WHEN** the same instance and principal pair is written twice
- **THEN** the relation holds one row for it

### Requirement: The principal lookup and the list's order share one index

`initSchema` SHALL declare an index over the principal, the instance list's
ordering key, and the instance id, in that order. It joins the enumeration the
"Every query predicate the engine relies on has a supporting index" requirement
carries.

The column order is load-bearing. The reader's principal is an equality bound.
The ordering key and instance id follow it as the range and tie-break the
keyset page walks. A different order forces a sort.

Its reader is the instance list read under `scope: "visible"`. That read
resolves one bounded lookup per principal the reader holds. Each lookup drives
from this index, in the page's order. It joins `instances` by primary key to
apply the request's own filters.

#### Scenario: A visible-scope page reads from the index

- **WHEN** the instance list read runs under `scope: "visible"`
- **THEN** each per-principal lookup uses this index and returns rows in the
  page's order, with no sort step

#### Scenario: The index exists after a fresh schema creation

- **WHEN** `initSchema` runs against an empty database
- **THEN** the index exists over the principal, the ordering key and the
  instance id
