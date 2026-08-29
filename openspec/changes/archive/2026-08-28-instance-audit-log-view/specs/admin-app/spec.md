<!-- antislop: allow-file passive-voice -->
<!-- The SHALL/WHEN/THEN Gherkin grammar this repo's specs use is structurally passive; see admin-app/spec.md under openspec/specs/ for the same directive and reason. -->

## ADDED Requirements

### Requirement: The instance screen shows an Audit Log section

The `/instances/:id` screen SHALL show an Audit Log section, beside the
existing merged-record timeline. It SHALL build that section from `GET
/admin/instances/:id/audit`. It SHALL list each entry's field id,
operation, actor, source and timestamp, in `seq` order. It SHALL also
list a value, when the entry carries one, and a reason, when the entry
carries one. It SHALL keyset-paginate the same way the merged-record
timeline already loads more.

A `redact` entry, and a `set` entry a later redaction cleared, SHALL
show a redaction marker in place of a value. It SHALL NOT show a blank
cell there. A blank cell would be indistinguishable from an unset
field.

#### Scenario: Audit entries show beside the merged record

- **WHEN** the operator opens the detail screen for an instance whose
  audit log holds entries
- **THEN** the Audit Log section lists them in `seq` order, each with
  its field id, operation, actor, source and timestamp

#### Scenario: A redacted value is shown as redacted, not blank

- **WHEN** the Audit Log section lists an entry whose value a redaction
  cleared
- **THEN** that entry shows a "redacted" marker, distinguishable from a
  `set` entry whose value is empty

#### Scenario: More entries load on demand

- **WHEN** the Audit Log section's first page does not cover every entry
- **THEN** a "load more" control fetches the next page via the returned
  cursor, matching the merged-record timeline's own pattern

### Requirement: The instance screen shows the chain's verified state

The instance screen SHALL show whether the instance's audit chain
verifies, sourced from `GET /admin/instances/:id/audit/verify`. It SHALL
show a "Verified" state when `ok` is true, and a "Verification failed at
entry `<failedSeq>`" state when `ok` is false. This check SHALL run once
per screen load, not once per Audit Log page turn.

#### Scenario: An intact chain shows as verified

- **WHEN** the operator opens the detail screen for an instance whose
  chain is unaltered
- **THEN** the screen shows a "Verified" indicator

#### Scenario: A tampered chain shows as failed, naming the entry

- **WHEN** the operator opens the detail screen for an instance whose
  audit log was altered outside the application
- **THEN** the screen shows a "Verification failed" indicator naming the
  first failing entry's sequence

#### Scenario: Paging the Audit Log does not re-trigger verification

- **WHEN** the operator loads a second page of the Audit Log section
- **THEN** no second call to `GET /admin/instances/:id/audit/verify` is
  made
