<!-- antislop: allow-file passive-voice -->
<!-- Every scenario in this file uses the fixed SHALL/WHEN/THEN Gherkin
     grammar the rest of this repo's specs already use (see persistence/
     spec.md's own allow-file passive-voice for the same reason). That
     grammar is structurally passive ("WHEN X is called", "THEN Y is
     redacted"); rewriting it to dodge the rule would break the required
     Scenario format. -->

# data-retention

## Purpose

Defines how a completed instance's personal data is cleared from the
datastore. Clearing happens on demand via `redactInstance`, or
automatically via an opt-in sweep. Either path leaves `history_entries`
and `instance_events` intact, and clears the values of `instance_audit`
while keeping its rows.

## Requirements

### Requirement: redactInstance clears personal data across five relations

`redactInstance(instanceId, db, opts?: { actor?, reason? })`
(`src/engine/retention.ts`) SHALL clear a non-`running` instance's
personal data in one transaction. It SHALL set `instances.body.data` to
`{}` and stamp `instances.redacted_at` to the current time. It SHALL also
delete every row in `instance_comments`, `instance_attachments`, and
`instance_drafts` whose `instance_id` matches.

The optional `opts` names who asked and why. The automatic sweep supplies
neither, and the audit entries then carry a null actor.

It SHALL redact every field the instance's audit log holds an entry
for.
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
- **THEN** the three original entries remain, each holding no value and
  no salt. The wipe's own entries and the redaction's stand beside
  them

#### Scenario: A redacted instance's chain still verifies

- **WHEN** chain verification runs after `redactInstance`
- **THEN** it reports the chain as holding

### Requirement: redactInstance refuses a running instance

`redactInstance` SHALL refuse an instance whose `status` is `running`,
whether called by the automatic sweep or the manual route. It SHALL
throw `InstanceRunningError`, naming the instance's id and status. It
SHALL NOT clear `data` or delete comment, attachment, or draft rows for a
`running` instance.

#### Scenario: A running instance is refused

- **WHEN** `redactInstance` is called for an instance whose `status` is
  `running`
- **THEN** it throws `InstanceRunningError` and no row is changed

#### Scenario: completed, cancelled, and faulted instances are all eligible

- **WHEN** `redactInstance` is called for an instance whose `status` is
  `completed`, `cancelled`, or `faulted`
- **THEN** the instance is redacted; `status` alone, not any other
  instance property, decides eligibility

### Requirement: redactInstance is idempotent

A second `redactInstance` call against an already-redacted instance SHALL be
a no-op. It SHALL NOT throw. It SHALL NOT re-run the comment, attachment, or
draft deletes. It SHALL NOT append a second `redact` entry, and SHALL NOT
clear any further audit value.

#### Scenario: Redacting twice changes nothing on the second call

- **WHEN** `redactInstance` is called for an instance whose
  `redacted_at` is already set
- **THEN** the call returns the unchanged instance and no further row is
  deleted

#### Scenario: A second redaction appends no second redact entry

- **WHEN** `redactInstance` is called a second time for an instance whose
  `redacted_at` is already set
- **THEN** the audit log holds the entries it held before the call, and
  nothing further is cleared

### Requirement: An automatic sweep is opt-in via DATA_RETENTION_DAYS

`startEngine` (`src/engine/host.ts`) SHALL start the retention sweep's
`pollForever` call only when the `DATA_RETENTION_DAYS` environment
variable is set and parses as a positive integer. It SHALL NOT start
that call when the variable is unset. It SHALL NOT apply a default
retention window.

A `DATA_RETENTION_DAYS` value that is set but does not parse as a
positive integer SHALL cause `startEngine` to throw. It SHALL throw
before any worker starts, and SHALL NOT be treated the same as an
unset variable.

#### Scenario: The sweep does not run without the variable

- **WHEN** the engine starts and `DATA_RETENTION_DAYS` is unset
- **THEN** no retention sweep worker runs, and no instance is redacted
  automatically

#### Scenario: The sweep runs once the variable is set

- **WHEN** the engine starts with `DATA_RETENTION_DAYS` set to a
  positive integer
- **THEN** the retention sweep worker runs on a recurring interval

#### Scenario: An invalid value fails startup instead of silently disabling the sweep

- **WHEN** the engine starts with `DATA_RETENTION_DAYS` set to a value
  that is not a positive integer (for example `"0"`, `"-5"`, or `"abc"`)
- **THEN** `startEngine` throws, no worker starts, and the engine does
  not come up

### Requirement: The sweep redacts only eligible completed and cancelled instances

Each sweep tick SHALL select instances whose `status` is `completed` or
`cancelled`, whose `redacted_at` is `NULL`, and whose
`currentStepEnteredAt` is older than `DATA_RETENTION_DAYS` days. It SHALL
call `redactInstance` once per selected instance. A failure redacting one
instance SHALL NOT stop the rest of the batch.

`faulted` instances SHALL be excluded from the automatic sweep
regardless of age. An instance inside the retention window SHALL NOT be
selected.

#### Scenario: An eligible completed instance past the window is redacted

- **WHEN** a sweep tick runs and a `completed` instance's
  `currentStepEnteredAt` is older than the configured window
- **THEN** that instance is redacted by the end of the tick

#### Scenario: An instance inside the window is skipped

- **WHEN** a sweep tick runs and a `completed` instance's
  `currentStepEnteredAt` is younger than the configured window
- **THEN** that instance is not redacted by this tick

#### Scenario: A faulted instance is never swept automatically

- **WHEN** a sweep tick runs and a `faulted` instance is otherwise past
  the configured window
- **THEN** that instance is not redacted by the sweep

#### Scenario: One instance's redaction failure does not block the batch

- **WHEN** a sweep tick selects several eligible instances and
  `redactInstance` fails for one of them
- **THEN** the remaining eligible instances in the batch are still
  redacted

### Requirement: The sweep selects eligible instances in bounded, paginated batches

A sweep tick SHALL NOT select every eligible instance in one unbounded
query. It SHALL select at most 500 instance ids at a time, keyset-paged
by `instance_id`. This is the same pagination shape `migrateInstances`
and `findOrphanKeys` already use for their own scans. A tick SHALL keep
paging through further batches until no eligible instance remains. It
SHALL NOT stop after the first batch.

#### Scenario: A backlog larger than one batch is fully processed in one tick

- **WHEN** a sweep tick runs and more than 500 instances are eligible
- **THEN** every eligible instance is redacted by the end of that tick,
  not just the first 500

#### Scenario: No single query selects an unbounded result set

- **WHEN** the sweep's selection query is inspected
- **THEN** it carries a bound on the number of rows it can return in one
  round trip
