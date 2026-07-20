## ADDED Requirements

### Requirement: A skipped migration is recorded as an event

The event union SHALL gain a `migration.skipped` kind, recorded when a migration
leaves an instance on its source version under `reject-and-pin`.

Its payload SHALL name the source version, the target version, and the reason the
instance could not be placed. Like every event, it records the `transitionSeq` in
force without advancing it, and lands in the same transaction as the invocation
step that produced it.

This is the additive kind the record shape was built to take: a skip changes no
step — it changes nothing at all — so it has nowhere to go in a `HistoryEntry`,
whose `toStepId` is required and load-bearing. A migration that *does* move an
instance is a transition and keeps its `HistoryEntry` with `cause: "migration"`;
the two records are not alternatives for the same fact.

The `version` an event carries is the version in force, which for a skip is the
source version — the instance did not move, so ids in its payload resolve there.

#### Scenario: A skip is recorded at the unchanged sequence

- **WHEN** an unmappable instance at `transitionSeq` N is skipped
- **THEN** a `migration.skipped` event carrying N is appended, and the instance's
  `transitionSeq` is still N

#### Scenario: A skip event names both versions and the reason

- **WHEN** a `migration.skipped` event is read back
- **THEN** it names the source version, the target version, and why the instance
  could not be placed

#### Scenario: A skip carries the source version

- **WHEN** an instance pinned to version 1 is skipped by a migration to version 2
- **THEN** the event's `version` is 1

#### Scenario: A migrated instance records no skip event

- **WHEN** an instance migrates successfully
- **THEN** no `migration.skipped` event is recorded for it, and its migration is
  recorded as a `HistoryEntry` instead
