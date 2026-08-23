## ADDED Requirements

### Requirement: A process declares which groups its steps may reference

`ProcessBody` SHALL carry an optional `allowedGroups` field, typed
`string[]`. It lists the group ids this process's steps may reference in
any assignment config. A body declaring no `allowedGroups` SHALL parse
successfully, with `allowedGroups` reading as `undefined`. The field is
optional, not defaulted, so a body predating it keeps its existing
`definitionHash` (see design.md's "`.optional()`, not `.default()`"
decision). Every reader of the compiled body treats an absent
`allowedGroups` as an empty list, via `?? []`. No reader treats a present
but empty `allowedGroups` any differently from an absent one.

`allowedGroups` names groups the `group-administration` capability's store
holds. The schema layer resolves no external store. The definition
contract itself SHALL NOT validate an entry against that store at parse
time. `group-scope-validation`'s publish-time check (a separate capability)
is where that resolution happens.

#### Scenario: A process with no allowedGroups parses successfully

- **WHEN** a process body declares no `allowedGroups` field
- **THEN** the process body parses successfully, and its `allowedGroups`
  reads as `undefined`

#### Scenario: A process declaring allowedGroups parses

- **WHEN** a process body declares `"allowedGroups": ["group_finance",
  "group_ops"]`
- **THEN** the process body parses successfully (subject to every other
  invariant)

### Requirement: A step's org.group-members reference resolves within the process's own allowedGroups

The compile pass SHALL reject a step whose `assignment.strategy.type` is
`org.group-members` when that step's `config.groupId` is absent from the
process's own `allowedGroups`. The rejection SHALL name the step and the
missing group id.

This check takes the write-path placement under this capability's
placement rule. A hand-written body could satisfy `publishedProcessBody`
while carrying a step whose group reference is not declared in
`allowedGroups`. The invariant is therefore one a hand-written body must
not bypass. It runs alongside the compile pass's other id-resolution
checks, with no database involved. It compares two lists already present
in the body.

#### Scenario: A declared group reference publishes

- **WHEN** a process declares `"allowedGroups": ["group_finance"]`, and a
  step declares `{ "type": "org.group-members", "config": { "groupId":
  "group_finance" } }`
- **THEN** the publish succeeds (subject to every other invariant)

#### Scenario: An undeclared group reference fails the publish

- **WHEN** a step declares `{ "type": "org.group-members", "config": {
  "groupId": "group_finance" } }`, and the process's `allowedGroups` does
  not include `"group_finance"`
- **THEN** the publish fails with a validation error naming that step and
  `"group_finance"`
