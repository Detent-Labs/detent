## Purpose

Lets a process keep its own Developer, Owner and Reader lists, each holding
users and groups. A Developer edits and publishes the process. An Owner
manages who reads it. A Reader gets standing read access, with no studio
access implied.

## ADDED Requirements

### Requirement: A process carries three principal lists

The engine SHALL store, per process, three lists: Developer, Owner and
Reader. Each list SHALL hold zero or more entries. Each entry SHALL be a
`user_xxx` id or a `group_xxx` id, the same principal shape
`instance_principals` already uses.

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

### Requirement: Matching a principal resolves from the actor's credential

The engine SHALL resolve one function that decides whether an actor matches
a list entry. A match is the actor's own id, or one of the groups the actor
belongs to, per `getGroupsForMember`. Group membership SHALL resolve live,
against the group store. The engine SHALL NOT rewrite a list when a
membership changes.

A Developer-list or an Owner-list match SHALL additionally need the
matching actor to hold the role that list requires: `DEVELOPER_ROLE` or
`AUTHOR_ROLE` for Developer, `OWNER_ROLE` for Owner. A group entry on either
list therefore admits only the members who also hold that role. A member
lacking it gets no access through the group entry.

A Reader-list match does not need a role. Any user or group entry on the
Reader list SHALL match, whatever role the matching account holds or lacks.

#### Scenario: A Developer-list group entry filters by role

- **WHEN** a group is on a process's Developer list, and one member holds
  `system:developer` while another does not
- **THEN** the first member matches the Developer list
- **AND** the second member does not

#### Scenario: An Owner-list group entry filters by role

- **WHEN** a group is on a process's Owner list, and one member holds
  `system:owner` while another does not
- **THEN** the first member matches the Owner list
- **AND** the second member does not

#### Scenario: A Reader-list entry does not need a role

- **WHEN** a user with no reserved role is on a process's Reader list
- **THEN** that user matches the Reader list

#### Scenario: Reader access follows live group membership

- **WHEN** a group is on a process's Reader list
- **AND** an account joins that group after an actor creates the process
- **THEN** the account matches the Reader list from that point on
- **AND** the engine writes nothing to the list itself

### Requirement: A Developer manages the Developer and Owner lists

An actor matching a process's Developer list, per the rule above, adds and
deletes entries on that list. The same actor adds and deletes entries on
that process's Owner list.

The engine SHALL refuse the write for an actor matching neither list. An
actor holding `ADMIN_ROLE` always succeeds, regardless of either list.

#### Scenario: A listed Developer edits the Developer list

- **WHEN** an actor matching a process's Developer list adds or deletes an
  entry on that list
- **THEN** the write succeeds

#### Scenario: A listed Developer edits the Owner list

- **WHEN** an actor matching a process's Developer list adds or deletes an
  entry on that process's Owner list
- **THEN** the write succeeds

#### Scenario: The engine refuses an unlisted actor

- **WHEN** an actor matching neither a process's Developer list nor its
  Owner list adds an entry on either list
- **THEN** the engine refuses the write

#### Scenario: An admin edits either list unconditionally

- **WHEN** an actor holding `ADMIN_ROLE`, matching neither list, adds or
  deletes an entry on a process's Developer or Owner list
- **THEN** the write succeeds

### Requirement: An Owner manages the Reader list

An actor matching a process's Owner list SHALL add and delete entries on
that process's Reader list. A Developer who does not also match the Owner
list SHALL get the same refusal an unlisted actor gets. An actor holding
`ADMIN_ROLE` SHALL always succeed.

#### Scenario: A listed Owner edits the Reader list

- **WHEN** an actor matching a process's Owner list adds or deletes an
  entry on that process's Reader list
- **THEN** the write succeeds

#### Scenario: The engine refuses a Developer holding no Owner entry

- **WHEN** an actor matches a process's Developer list, but not its Owner
  list
- **AND** that actor adds an entry on the process's Reader list
- **THEN** the engine refuses the write

#### Scenario: An admin edits the Reader list unconditionally

- **WHEN** an actor holding `ADMIN_ROLE`, matching no Owner entry, adds an
  entry on a process's Reader list
- **THEN** the write succeeds

### Requirement: A list entry does not need a role at write time

Adding a Developer, Owner or Reader entry SHALL succeed either way. It does
not matter whether the named user or group currently satisfies that list's
role requirement. The role requirement applies only when the engine later
checks a match. It never applies at write time.

#### Scenario: A Developer entry succeeds ahead of the role

- **WHEN** a Developer-list entry names a user who holds neither
  `system:developer` nor `system:author` yet
- **THEN** the write succeeds
- **AND** that user does not yet match the Developer list

### Requirement: Process creation writes the creator onto the Developer list

Creating a process needs `CREATE_ROLE`, alongside `DEVELOPER_ROLE` or
`AUTHOR_ROLE`, per `process-drafts`. On success the engine SHALL write the
creator onto the new process's Developer list, in the same write as the
process's own creation.

#### Scenario: The creator lands on the Developer list

- **WHEN** an actor holding `CREATE_ROLE` and `system:developer` creates a
  process
- **THEN** that actor matches the new process's Developer list at once

### Requirement: A rollout migration seeds every existing process's Developer list

The change that ships this capability SHALL run a one-time migration. For
every process that already carries a draft or a published version, the
migration SHALL add every account holding `system:developer` or
`system:author` to that process's Developer list.

The migration SHALL be idempotent. A second run does not add a duplicate
entry. A second run changes nothing the first run already covered
correctly.

#### Scenario: An existing process keeps every current author's access

- **WHEN** the migration runs over a process with three accounts holding
  `system:developer` or `system:author`
- **THEN** all three accounts match that process's Developer list afterward

#### Scenario: A second migration run changes nothing

- **WHEN** the migration runs a second time over an already-migrated process
- **THEN** the process's Developer list holds the same entries it held
  before the second run
