<!-- antislop: allow-file passive-voice -->
<!-- Carries the main spec's own directive and reason: the fixed SHALL/WHEN/THEN Gherkin grammar is structurally passive. -->

## RENAMED Requirements

- FROM: `### Requirement: redactInstance clears personal data across four relations`
- TO: `### Requirement: redactInstance clears personal data across five relations`

## MODIFIED Requirements

### Requirement: redactInstance clears personal data across five relations

`redactInstance(instanceId, db)` (`src/engine/retention.ts`) SHALL clear a
non-`running` instance's personal data in one transaction. It SHALL set
`instances.body.data` to `{}` and stamp `instances.redacted_at` to the
current time. It SHALL also delete every row in `instance_comments`,
`instance_attachments`, and `instance_drafts` whose `instance_id` matches.

It SHALL redact every field the instance's audit log holds a value for.
The audit log is the fifth relation, and the only one redaction neither
leaves alone nor deletes from. Its rows stay and their values go. The
log still shows that a field changed, when, and at whose hand.

The `history_entries` and `instance_events` relations SHALL NOT be
touched. Neither carries a field value, so neither needs redaction. That
reasoning no longer covers the audit log, which holds field values by
design.

#### Scenario: Redacting a completed instance clears data and deletes rows

- **WHEN** `redactInstance` is called for a `completed` instance holding field
  data, comments, attachments, and a form draft
- **THEN** the instance's `data` becomes `{}`, `redacted_at` is set, and every
  `instance_comments`/`instance_attachments`/`instance_drafts` row for that
  instance is deleted

#### Scenario: The audit trail survives redaction

- **WHEN** an instance is redacted
- **THEN** its `history_entries` and `instance_events` rows are
  unchanged, so the instance's transition and event history still reads
  in full

#### Scenario: Redaction clears the audit log's values and keeps its rows

- **WHEN** `redactInstance` is called for an instance whose audit log
  holds three entries across two fields
- **THEN** all three entries remain, each holding no value and no salt.
  The log still names each entry's field, time and actor

#### Scenario: A redacted instance's chain still verifies

- **WHEN** chain verification runs after `redactInstance`
- **THEN** it reports the chain as holding
