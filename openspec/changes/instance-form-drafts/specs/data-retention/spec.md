# data-retention

## REMOVED Requirements

### Requirement: redactInstance clears personal data across three relations

## MODIFIED Requirements

### Requirement: redactInstance refuses a running instance

`redactInstance` SHALL refuse an instance whose `status` is `running`,
whether called by the automatic sweep or the manual route. It SHALL throw
`InstanceRunningError`, naming the instance's id and status. It SHALL NOT
clear `data` or delete comment, attachment, or draft rows for a `running`
instance.

#### Scenario: A running instance is refused

- **WHEN** `redactInstance` is called for an instance whose `status` is
  `running`
- **THEN** it throws `InstanceRunningError` and no row is changed

#### Scenario: completed, cancelled, and faulted instances are all eligible

- **WHEN** `redactInstance` is called for an instance whose `status` is
  `completed`, `cancelled`, or `faulted`
- **THEN** the instance is redacted; `status` alone, not any other instance
  property, decides eligibility

### Requirement: redactInstance is idempotent

A second `redactInstance` call against an already-redacted instance SHALL be
a no-op. It SHALL NOT throw, and it SHALL NOT re-run the comment, attachment,
or draft deletes.

#### Scenario: Redacting twice changes nothing on the second call

- **WHEN** `redactInstance` is called for an instance whose `redacted_at` is
  already set
- **THEN** the call returns the unchanged instance and no further row is
  deleted

## ADDED Requirements

### Requirement: redactInstance clears personal data across four relations

`redactInstance(instanceId, db)` (`src/engine/retention.ts`) SHALL clear a
non-`running` instance's personal data in one transaction. It SHALL set
`instances.body.data` to `{}` and stamp `instances.redacted_at` to the
current time. It SHALL also delete every row in `instance_comments`,
`instance_attachments`, and `instance_drafts` whose `instance_id` matches.

The `history_entries` and `instance_events` relations SHALL NOT be touched.
Neither carries a field value, so neither needs redaction.

#### Scenario: Redacting a completed instance clears data and deletes rows

- **WHEN** `redactInstance` is called for a `completed` instance that holds
  submitted field data, one or more comments, one or more attachments, and a
  saved form draft
- **THEN** the instance's `data` becomes `{}`, `redacted_at` is set, and every
  `instance_comments`/`instance_attachments`/`instance_drafts` row for that
  instance is deleted

#### Scenario: The audit trail survives redaction

- **WHEN** an instance is redacted
- **THEN** its `history_entries` and `instance_events` rows are unchanged, so
  the instance's transition and event history still reads in full
