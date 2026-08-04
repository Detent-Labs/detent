<!-- antislop: allow-file passive-voice -->
## Purpose

Holds one manager pointer per local account. It also holds the built-in
`org.manager-of-starter` assignment strategy that reads that pointer. A step then
routes to the manager of the person who started the instance. It no longer routes
to a list frozen into the definition.

## ADDED Requirements

### Requirement: An account carries a manager pointer to one other account

`auth_users` SHALL carry a nullable `manager_user_id` column, referencing
`auth_users.user_id`. It SHALL name at most one other account. It SHALL NOT
express a department, a deputy, a matrix, or any second hop.

The column SHALL be added by the existing `initSchema` DDL. The statement SHALL
change an already-created table, so a database predating this change gains the
column on the next start. Existing rows SHALL get `NULL`.

An account whose `manager_user_id` is `NULL` has no manager on record. That is a
valid state rather than a failure. It SHALL NOT prevent login, listing, or any
other account operation.

A dangling pointer SHALL be unrepresentable. The column SHALL reference
`auth_users.user_id`, so an id naming no account cannot be written.

A cycle between two accounts SHALL remain representable. Nothing traverses the
pointer, so a cycle has no effect.

#### Scenario: The column is added to an existing table

- **WHEN** `initSchema` runs against a database whose `auth_users` predates this
  change
- **THEN** `auth_users` has a `manager_user_id` column and every existing row
  holds `NULL`

#### Scenario: A manager pointer round-trips

- **WHEN** an account's manager is set to another existing account's `user_id`
- **AND** that account is then read back
- **THEN** the value read is the `user_id` that was written

#### Scenario: A pointer to no account is refused

- **WHEN** an account's manager is set to an id matching no `auth_users` row
- **THEN** the write fails and that account's manager is unchanged

#### Scenario: An account with no manager is fully usable

- **WHEN** an account whose `manager_user_id` is `NULL` logs in and is listed
- **THEN** both succeed exactly as for an account created before this change

### Requirement: The org.manager-of-starter strategy resolves the starter's manager

The engine SHALL ship `org.manager-of-starter` as a registered assignment
strategy. Its declared config schema SHALL accept an empty object. It SHALL
reject any key, since the strategy reads nothing from its config.

The strategy SHALL read `instance.startedBy`. It SHALL look up that account's
manager. It SHALL return that manager's `user_id` as the single candidate.

The value returned SHALL be the id the manager authenticates with. It therefore
matches `Actor.id`, `assignment.claimedBy` and the inbox filter with no
translation.

The strategy SHALL return an empty list in three cases. Those are an instance
recording no `startedBy`, a `startedBy` matching no account, and an account with
no manager on record.

The strategy SHALL resolve one hop. It SHALL NOT walk a chain of managers. It
SHALL NOT resolve the manager of whoever performed the previous step.

The resolved list SHALL freeze onto the instance at step entry. A later change to
the starter's manager SHALL NOT reach an instance that already entered the step.

#### Scenario: The strategy resolves the starter's manager

- **WHEN** an instance started by an account whose manager is `user_boss` enters
  a step declaring `{ "type": "org.manager-of-starter", "config": {} }`
- **THEN** `instance.assignment.candidates` is exactly `["user_boss"]`

#### Scenario: Two instances of one definition resolve to different managers

- **WHEN** two people with different managers each start the same definition
- **AND** both instances reach the step declaring `org.manager-of-starter`
- **THEN** each instance's candidates name that starter's own manager
- **AND** the other instance's manager is not an eligible candidate for it

#### Scenario: A starter with no manager resolves to nobody

- **WHEN** an instance started by an account whose `manager_user_id` is `NULL`
  enters a step declaring `org.manager-of-starter`
- **THEN** the entry commits and `instance.assignment.candidates` is empty

#### Scenario: The resolved manager is frozen at entry

- **WHEN** an instance has entered a step resolved to `["user_boss"]`
- **AND** the starter's manager is then set to another account
- **THEN** that instance's candidates still name `user_boss`

#### Scenario: A config carrying any key is refused at publish

- **WHEN** a body declares `{ "type": "org.manager-of-starter", "config": {
  "depth": 2 } }`
- **THEN** publishing fails with a registry validation failure naming that
  strategy's config
