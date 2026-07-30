<!-- antislop: allow-file passive-voice -->
## ADDED Requirements

### Requirement: Instance attachments are persisted independently of the audit-trail relations

The datastore SHALL hold instance attachments in their own relation,
`instance_attachments` (`id`, `instance_id`, `actor_id`, `filename`,
`content_type`, `size_bytes`, `data`, `created_at`). The `history_entries`
and `instance_events` relations SHALL NOT carry attachment data.

Keeping attachments in their own relation matters for one reason. A
future redaction pass can then clear personal data from an attachment
without touching the append-only `HistoryEntry`/`InstanceEvent` audit
trail. This mirrors why `instance_comments` already sits apart from that
audit trail.

#### Scenario: An attachment is stored in its own relation

- **WHEN** a file is uploaded to an instance
- **THEN** a row is inserted into `instance_attachments`, and no row is
  inserted into `history_entries` or `instance_events`

#### Scenario: The audit-trail relations are unchanged

- **WHEN** the schema is initialised on a database created before this
  capability
- **THEN** `history_entries` and `instance_events` have the same columns
  as before

### Requirement: Attachment lookup by instance is indexed

`initSchema` SHALL create an index supporting `instance_attachments`'
lookup by `(instance_id, created_at, id)`, mirroring the index
`instance_comments` already has over the same column shape.

#### Scenario: Initialisation creates the attachment lookup index

- **WHEN** the schema is initialised
- **THEN** an index over `instance_attachments (instance_id, created_at,
  id)` exists

#### Scenario: Initialisation is idempotent

- **WHEN** the schema is initialised twice
- **THEN** the second run succeeds and the index is unchanged
