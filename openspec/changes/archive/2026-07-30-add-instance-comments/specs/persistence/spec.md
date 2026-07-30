<!-- antislop: allow-file passive-voice -->
## ADDED Requirements

### Requirement: Instance comments are persisted independently of the audit-trail relations

The datastore SHALL hold instance comments in their own relation,
`instance_comments` (`id`, `instance_id`, `actor_id`, `text`,
`created_at`). The `history_entries` and `instance_events` relations
SHALL NOT carry comment text.

Keeping comments in their own relation matters for one reason. A future
redaction pass can then clear personal data from a comment without
touching the append-only `HistoryEntry`/`InstanceEvent` audit trail. This
mirrors why migration plans already sit apart from `definitions`.

#### Scenario: A comment is stored in its own relation

- **WHEN** a comment is posted on an instance
- **THEN** a row is inserted into `instance_comments`, and no row is
  inserted into `history_entries` or `instance_events`

#### Scenario: The audit-trail relations are unchanged

- **WHEN** the schema is initialised on a database created before this
  capability
- **THEN** `history_entries` and `instance_events` have the same columns
  as before

### Requirement: Comment lookup by instance is indexed

`initSchema` SHALL create an index supporting `instance_comments`'
lookup by `(instance_id, created_at, id)`, mirroring the index
`instance_events` already has over its own `(instance_id,
transition_seq)`.

#### Scenario: Initialisation creates the comment lookup index

- **WHEN** the schema is initialised
- **THEN** an index over `instance_comments (instance_id, created_at,
  id)` exists

#### Scenario: Initialisation is idempotent

- **WHEN** the schema is initialised twice
- **THEN** the second run succeeds and the index is unchanged
