# process-access-roles Specification

## Purpose

Lets a process keep its own Developer, Owner and Reader lists, each holding
users and groups. A Developer edits and publishes the process. An Owner
manages who reads it. A Reader gets standing read access, with no studio
access implied.

## Requirements

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
- **AND** an actor whose id is `auth0|42` and who holds `system:developer`
  matches it

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

A first publish through `POST /processes` is a creation too. That means a
process with no draft and no published version. The engine SHALL write the
publishing actor onto the new process's Developer list. It SHALL do so in the
same transaction as the new version. That path asks for no `CREATE_ROLE`, as
before.

#### Scenario: The creator lands on the Developer list

- **WHEN** an actor holding `CREATE_ROLE` and `system:developer` creates a
  process
- **THEN** that actor matches the new process's Developer list at once

#### Scenario: The first publisher lands on the Developer list

- **WHEN** an actor holding `system:developer` and `system:publish` publishes
  a process with no draft and no published version through `POST /processes`
- **THEN** that actor matches the new process's Developer list at once
- **AND** the same actor publishes version 2 through `POST /processes`

#### Scenario: A failed first publish leaves no list entry

- **WHEN** a first publish through `POST /processes` fails validation
- **THEN** the process's Developer list stays empty

### Requirement: The Developer list gates both publish routes

`POST /drafts/:processId/publish` and `POST /processes` SHALL refuse an actor
who lacks `ADMIN_ROLE` and does not match the process's Developer list. The
refusal SHALL be an authorization error. The check SHALL run beside the
`publish` permission check and SHALL NOT replace it.

A process with no draft and no published version has no list yet. Both routes
SHALL skip the check for it, so its first publish stays possible.

#### Scenario: A publisher off the list gets 403 on both routes

- **WHEN** an actor holding `system:author` and `system:publish` is not on the
  Developer list of a process with a version and a draft
- **AND** the actor calls `POST /drafts/:processId/publish`
- **THEN** the response is 403
- **AND** the same actor calling `POST /processes` with a body for that
  process also reads 403

#### Scenario: A group on the list admits its member on both routes

- **WHEN** a group is on a process's Developer list
- **AND** a member of that group holds `system:author` and `system:publish`
- **THEN** that member publishes through either route

#### Scenario: A publish grant does not replace a list entry

- **WHEN** an actor holds a grant of `"publish"` scoped to a process
- **AND** the actor is not on that process's Developer list
- **THEN** both publish routes refuse the actor

#### Scenario: The list entry alone is not enough

- **WHEN** an actor is on a process's Developer list
- **AND** the actor lacks `system:publish` and has no grant for the process
- **THEN** both publish routes refuse the actor

#### Scenario: A first publish asks for no list entry

- **WHEN** an actor who does not hold `ADMIN_ROLE` publishes a process that
  has no draft and no published version through `POST /processes`
- **THEN** the publish succeeds

#### Scenario: A listed actor without an authoring role gets 403

- **WHEN** an actor holding `system:publish`, and neither `system:developer`
  nor `system:author`, is on a process's Developer list
- **AND** the actor calls `POST /processes` with a body for that process
- **THEN** the response is 403, since a Developer match needs one of those
  roles
