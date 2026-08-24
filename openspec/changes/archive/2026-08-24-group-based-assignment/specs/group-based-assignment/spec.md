## Purpose

Holds the built-in `org.group-members` assignment strategy. A step
references one group by id. The strategy resolves that group's current
member list, live, at every step entry. A membership change then reaches
every process referencing the group with no republish.

## ADDED Requirements

### Requirement: The org.group-members strategy resolves a group's current members

The engine SHALL ship `org.group-members` as a registered assignment
strategy. Its declared config schema SHALL accept exactly one key, `groupId:
string`. It SHALL reject any other key.

At step entry, the strategy SHALL read the group named by
`config.groupId`'s CURRENT member list, from the groups store
`group-administration` defines. It SHALL return that group's members whose
`auth_users` account exists and is not disabled, as the resolved candidate
list.

The strategy SHALL resolve live, not from any value frozen earlier. This is
the strategy's entire purpose. A membership change touches the groups store
alone. Every step that has not yet entered sees it on its next entry, with
no republish of any process.

#### Scenario: The strategy resolves a group's members

- **WHEN** a group `group_finance` holds members `["user_a", "user_b"]`,
  both active accounts
- **AND** an instance enters a step declaring `{ "type":
  "org.group-members", "config": { "groupId": "group_finance" } }`
- **THEN** `instance.assignment.candidates` is exactly `["user_a",
  "user_b"]`

#### Scenario: A membership change reaches the next entry with no republish

<!-- antislop: allow passive-voice sentence-length -->
<!-- Why: the WHEN bullet names the triggering condition, mirroring every other scenario's style in this file; the AND line reads as 18 words on its own, the sentence-length finding here is the linter merging it with the masked comment above it. -->
- **WHEN** a group's member list is changed after a process referencing it
  is published
- **AND** an instance later enters the step declaring that group, whether
  a new instance or one re-entering the step
<!-- antislop: allow passive-voice -->
<!-- Why: an earlier wrapped `is published` line above masks to blank and breaks the block above; this directive re-covers the THEN bullet, whose style matches every other scenario in this file. -->
- **THEN** the resolved candidates reflect the group's CURRENT member list,
  not the list in force when the process was published

### Requirement: A disabled account never joins the resolved candidate list

<!-- antislop: allow passive-voice -->
<!-- Why: "account is disabled" names the account's own state, which any member may reach through any admin path; there is no single actor to name. -->
The strategy SHALL exclude a member whose `auth_users` account is disabled.
A disabled account cannot log in to claim the step. Including it would
only be clutter in the candidate list.

<!-- antislop: allow passive-voice -->
<!-- Why: this scenario's title states the outcome for the disabled member, matching this file's other scenario titles. -->
#### Scenario: A disabled member is excluded

<!-- antislop: allow passive-voice -->
<!-- Why: "account is disabled" names the account's own state, mirroring the requirement's own wording above. -->
- **WHEN** a group holds members `["user_a", "user_b"]`, and `user_b`'s
  account is disabled
- **AND** an instance enters a step declaring that group
- **THEN** `instance.assignment.candidates` is exactly `["user_a"]`

### Requirement: A group id naming no group resolves to no candidates

<!-- antislop: allow passive-voice -->
<!-- Why: "cannot be deleted" cross-references group-administration's own deletion guard, which this file's requirement does not itself enforce. -->
The strategy SHALL resolve to an empty candidate list, never a thrown
exception, when `config.groupId` names no group the store holds. This matches
the engine's total-resolution rule: an unresolvable reference yields zero
candidates rather than raising. `group-administration`'s deletion guard
makes this path rare, since a group referenced by a published process's
`allowedGroups` cannot be deleted.

#### Scenario: A missing group resolves to no candidates, with nothing thrown

- **WHEN** an instance enters a step declaring `{ "type":
  "org.group-members", "config": { "groupId": "group_ghost" } }`, and no
  group named `group_ghost` exists
- **THEN** the entry commits, `instance.assignment.candidates` is empty, and
  nothing is thrown

<!-- antislop: allow passive-voice -->
<!-- Why: this requirement's title states the publish outcome, matching this file's other requirement titles. -->
### Requirement: A config carrying an unknown key is refused at publish

`org.group-members`'s config schema SHALL accept `groupId` alone. A
`config` carrying any other key SHALL fail the registry's config-validation
check at publish.

<!-- antislop: allow passive-voice -->
<!-- Why: this scenario's title states the publish outcome, mirroring the requirement's own title above and this file's other scenario titles. -->
#### Scenario: A config carrying an extra key is refused at publish

- **WHEN** a body declares `{ "type": "org.group-members", "config": {
  "groupId": "group_finance", "fallback": "user_a" } }`
- **THEN** publishing fails with a registry validation failure naming that
  strategy's config

<!-- antislop: allow passive-voice -->
<!-- Why: this scenario's title states the publish outcome, mirroring this file's other scenario titles. -->
#### Scenario: A config missing groupId is refused at publish

- **WHEN** a body declares `{ "type": "org.group-members", "config": {} }`
- **THEN** publishing fails with a registry validation failure naming that
  strategy's config
