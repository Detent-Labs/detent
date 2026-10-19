## MODIFIED Requirements

### Requirement: A process carries three principal lists

The engine SHALL store, per process, three lists: Developer, Owner and
Reader. Each list SHALL hold zero or more entries. Each entry SHALL be a
non-empty actor id or group id, the same principal shape
`instance_principals` already uses. The engine SHALL NOT require a
`user_` or `group_` prefix, because a JWT actor's id is its `sub` claim.

The lists SHALL NOT live in `ProcessBody`. They SHALL NOT enter
`definitionHash`. A process's access lists SHALL stay the same across a
publish, a version bump, and a migration. They name who reaches the process
itself. They do not name who reaches one pinned version of it.

#### Scenario: A fresh process starts with the creator alone

- **WHEN** an actor creates a process, naming no list entries
- **THEN** the new process's Developer list holds that actor
- **AND** its Owner and Reader lists start empty

#### Scenario: Publishing does not touch the lists

- **WHEN** an author publishes a new version of a process that already
  carries Developer, Owner and Reader entries
- **THEN** all three lists hold the same entries after the publish

#### Scenario: The engine stores an entry without a prefix

- **WHEN** a Developer adds the entry `auth0|42` to a process's Developer list
- **THEN** the engine stores the entry
- **AND** an actor whose id is `auth0|42` matches it
