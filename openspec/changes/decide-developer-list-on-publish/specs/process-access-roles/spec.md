## MODIFIED Requirements

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

## ADDED Requirements

### Requirement: The Developer list gates both publish routes

`POST /drafts/:processId/publish` and `POST /processes` SHALL refuse an actor
who does not hold `ADMIN_ROLE` and does not match the Developer list of the
process they name. The refusal SHALL be an authorization error, which the
HTTP wrapper maps to 403. The check SHALL run in addition to the `publish`
permission check and SHALL NOT replace it. A refusal SHALL persist no version.

A process with no draft and no published version has no Developer list yet.
Both routes SHALL skip the list check for it, so the first publish of a new
process stays possible. Both routes SHALL share one definition of that
condition with the draft routes.

A grant of `"publish"` scoped to a process SHALL NOT stand in for a Developer
list entry. The two mechanisms stay separate, as the `authorization`
capability states.

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
