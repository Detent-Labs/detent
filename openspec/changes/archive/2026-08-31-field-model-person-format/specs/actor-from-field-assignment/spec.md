<!-- antislop: allow-file passive-voice run-ons sentence-length -->
<!-- This ADDED capability becomes a live spec at archive, beside sibling assignment specs that carry the same directive. -->
## Purpose

Holds the built-in `org.actor-from-field` assignment strategy. A step names
one process field declaring `format: "person"`; the strategy reads the
value the entering instance holds for that field and resolves it into the
step's candidate list, routing the step to whoever (or whatever group) the
process itself named.

## ADDED Requirements

### Requirement: The org.actor-from-field strategy resolves an entering instance's own person field

The engine SHALL ship `org.actor-from-field` as a registered assignment
strategy. Its declared config schema SHALL accept exactly one key,
`fieldId: string`. It SHALL reject any other key.

At step entry, the strategy SHALL read `ctx.instance.data[fieldId]`: the
value the entering instance holds for the named field, with any submitted
patch already merged, per the `assignment-strategy-registry` capability's
own definition of what a resolver's `instance.data` carries.

A value starting with `user_` SHALL resolve to a one-entry candidate list
holding exactly that value. A value starting with `group_` SHALL resolve
through the same live-membership path `org.group-members` uses: the
group's current member list, excluding a disabled account, from the store
`group-administration` defines.

#### Scenario: A user-id value resolves to that one candidate

- **WHEN** an instance holds `{ "approver_id": "user_a" }`
- **AND** an instance enters a step declaring `{ "type":
  "org.actor-from-field", "config": { "fieldId": "approver_id" } }`
- **THEN** `instance.assignment.candidates` is exactly `["user_a"]`

#### Scenario: A group-id value resolves to that group's current members

- **WHEN** an instance holds `{ "approver_id": "group_finance" }`, and
  `group_finance` holds members `["user_a", "user_b"]`, both active accounts
- **AND** an instance enters a step declaring `{ "type":
  "org.actor-from-field", "config": { "fieldId": "approver_id" } }`
- **THEN** `instance.assignment.candidates` is exactly `["user_a",
  "user_b"]`

#### Scenario: A disabled group member is excluded

- **WHEN** an instance holds `{ "approver_id": "group_finance" }`, and
  `group_finance` holds members `["user_a", "user_b"]`, and `user_b`'s
  account is disabled
- **AND** an instance enters the step naming that field
- **THEN** `instance.assignment.candidates` is exactly `["user_a"]`

### Requirement: An unset or unrecognized field value resolves to no candidates, never a thrown exception

The strategy SHALL resolve to an empty candidate list when the named field
is absent from `instance.data`, when its value is not a string, or when
that string starts with neither `user_` nor `group_`. This matches the
engine's total-resolution rule: an unresolvable reference yields zero
candidates rather than raising. `resolveStepAssignment` classifies this as
`no-candidates` and records an `assignment.unresolved` event; it
substitutes no fallback assignee.

The `definition-contract` capability's own publish-time check already
rejects a step naming a field with no `format: "person"`, so an
already-published body's named field always carries that format. This
resolver stays total regardless: the field can still hold no value, or a
value written before the field's own type or format changed underneath an
in-flight instance across a migration.

#### Scenario: An unset field resolves to no candidates

- **WHEN** an instance has not yet written a value for the named field
- **AND** an instance enters the step naming that field
- **THEN** `instance.assignment.candidates` is empty, and nothing is thrown

#### Scenario: A value with neither recognized prefix resolves to no candidates

- **WHEN** an instance holds `{ "approver_id": "not-a-principal-id" }`
- **AND** an instance enters the step naming that field
- **THEN** `instance.assignment.candidates` is empty, and nothing is thrown

### Requirement: A config carrying an unknown key, or missing fieldId, is refused at publish

`org.actor-from-field`'s config schema SHALL accept `fieldId` alone. A
`config` carrying any other key, or omitting `fieldId`, SHALL fail the
registry's config-validation check at publish.

#### Scenario: A config carrying an extra key is refused at publish

- **WHEN** a body declares `{ "type": "org.actor-from-field", "config": {
  "fieldId": "field_approver", "fallback": "user_a" } }`
- **THEN** publishing fails with a registry validation failure naming that
  strategy's config

#### Scenario: A config missing fieldId is refused at publish

- **WHEN** a body declares `{ "type": "org.actor-from-field", "config": {}
  }`
- **THEN** publishing fails with a registry validation failure naming that
  strategy's config
