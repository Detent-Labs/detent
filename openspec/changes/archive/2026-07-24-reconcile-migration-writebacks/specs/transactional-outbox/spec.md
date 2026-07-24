## ADDED Requirements

### Requirement: Each outbox row is stamped with the field-version it was enqueued under

Every `INSERT INTO outbox` SHALL stamp the new row's `field_version` to the
enqueuing instance's version at that moment. This applies to every
enqueue site: instance creation's initial-step spawn, a transition's general
step-entry enqueue, and a timer firing's enqueue.

A row's `field_version` therefore always equals the instance's version at
enqueue time, and — because migration locks and remaps all of an instance's
outbox rows atomically with the instance's own version bump (see
`instance-migration`) — stays equal to the instance's current version for as
long as the row is undelivered.

#### Scenario: A row enqueued at instance creation is stamped

- **WHEN** an instance is created and its initial step enqueues actions
- **THEN** each enqueued row's `field_version` equals the instance's version
  at creation

#### Scenario: A row enqueued by a transition is stamped

- **WHEN** a transition commits and enqueues trigger actions
- **THEN** each enqueued row's `field_version` equals the instance's version
  at that commit

#### Scenario: A row enqueued by a timer fire is stamped

- **WHEN** a timer fires and enqueues its actions
- **THEN** each enqueued row's `field_version` equals the instance's version
  at that fire

### Requirement: Delivery is suppressed if the instance's version no longer matches the row's field_version

The claim step's snapshot (`ClaimedRow`) SHALL carry the claimed row's
`field_version`. The delivery transaction's instance-writeback UPDATE SHALL
additionally require the instance's current version to equal that
`field_version`, alongside its existing `status = 'running'` predicate, in the
same statement.

When this predicate fails — because the instance has migrated since the row
was claimed — the writeback SHALL affect no row, and this SHALL fold into the
existing suppression accounting (a writeback that affects no row is recorded
as suppressed on the `ActionOutcome`, exactly as an already-terminal instance
is today). No new outcome status is introduced.

#### Scenario: A writeback commits when the version still matches

- **WHEN** a claimed row's `field_version` still equals the instance's current
  version at delivery
- **THEN** the writeback applies normally and the row reaches `delivered`

#### Scenario: A stale writeback is suppressed, not misapplied

- **WHEN** an instance migrates after a row is claimed but before that claim's
  handler completes, and the handler then completes and delivery attempts the
  writeback
- **THEN** the writeback affects no row, the outcome is recorded as
  suppressed, and no value is written under the row's original (pre-migration)
  field id

#### Scenario: An unaffected instance still delivers normally

- **WHEN** a row is claimed and delivered for an instance that has not
  migrated
- **THEN** the version-fold predicate matches and delivery proceeds exactly as
  it does today
