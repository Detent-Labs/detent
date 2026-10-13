# Spec Delta

<!-- Why: each directive below covers text copied from the base requirement; its wording stays unchanged so the archive diff shows only the real edits. -->

## MODIFIED Requirements

<!-- antislop: allow synonym-rotation -->
### Requirement: A failing delivery records its error on the outbox row

<!-- antislop: allow synonym-rotation sentence-length em-dash -->
The `outbox` table SHALL carry a nullable `last_error text` column, declared
in its `CREATE TABLE` in `initSchema` with `claimed_at`, `event_id`
and `field_version`. `drainOutbox` SHALL write the failure message onto the row
in both failure branches — the dead-letter branch and the retry branch — and
SHALL clear it to `NULL` on a successful delivery, so the column always
describes the row's current state rather than a historical one.

This SHALL NOT replace or duplicate the `ActionOutcome` written to the record
that enqueued the action. It is a denormalized copy that makes an outbox
listing self-sufficient.

#### Scenario: A transient failure records the error and keeps retrying

- **WHEN** a delivery fails transiently and the row returns to `pending`
- **THEN** the row's `last_error` carries the failure message

#### Scenario: A dead-lettered row carries the error that killed it

- **WHEN** a delivery fails permanently, or exhausts its attempts
- **THEN** the row's status is `dead-letter` and its `last_error` carries the
  failure message

#### Scenario: A successful delivery clears a previous error

<!-- antislop: allow passive-voice long-words -->
- **WHEN** a row that had failed at least once is subsequently delivered
- **THEN** its status is `delivered` and its `last_error` is null
