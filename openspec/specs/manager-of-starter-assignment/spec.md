<!-- antislop: allow-file passive-voice -->
# manager-of-starter-assignment Specification

## Purpose
Holds one manager pointer per local account. It also holds the built-in
`org.manager-of-starter` assignment strategy that reads that pointer. A step then
routes to the manager of the person who started the instance. It no longer routes
to a list frozen into the definition.

## Requirements

### Requirement: An account has a manager pointer to one other account from its creation

`auth_users` SHALL carry a nullable `manager_user_id` column that references `auth_users.user_id`. It SHALL name at most one other account. It SHALL NOT express a department, a deputy, a matrix, or any second hop. The `CREATE TABLE` of `auth_users` in `initSchema` SHALL declare the column. `initSchema` SHALL NOT add it to a table that exists already.

#### Scenario: The column belongs to the new table

- **WHEN** `initSchema` runs against an empty database
- **THEN** `auth_users` has a `manager_user_id` column, and a new account holds `NULL` in it

### Requirement: An account with no manager stays usable

An account whose `manager_user_id` is `NULL` has no manager on record. That is a valid state and no failure. It SHALL NOT prevent login, listing, or any other account operation.

#### Scenario: An account with no manager is fully usable

- **WHEN** an account whose `manager_user_id` is `NULL` logs in and appears in the list
- **THEN** both succeed, exactly as for an account that existed before this change

### Requirement: A manager pointer cannot dangle

A dangling pointer SHALL be unrepresentable. The column SHALL reference `auth_users.user_id`, so `auth_users` rejects an id that names no account. A cycle between two accounts SHALL stay representable. Nothing traverses the pointer, so a cycle has no effect.

#### Scenario: A manager pointer round-trips

- **WHEN** a caller sets an account's manager to another existing account's `user_id`
- **AND** a caller then reads that account back
- **THEN** the value read is the `user_id` that the caller wrote

#### Scenario: A pointer to no account fails

- **WHEN** a caller sets an account's manager to an id that matches no `auth_users` row
- **THEN** the write fails and that account's manager stays as it was

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
