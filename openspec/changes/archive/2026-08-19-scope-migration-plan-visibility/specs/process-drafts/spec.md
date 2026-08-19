## ADDED Requirements

### Requirement: GET /drafts/:processId reports whether the caller may plan a migration

`GET /drafts/:processId`'s response SHALL carry one added field,
`canPlanMigration: boolean`. The engine SHALL compute this field from
`can(actor, "migrate", processId, db)` (see `authorization`), using the
resolved actor and the route's own `processId`. The Studio Versions screen
(see `studio-app`) SHALL read this field to decide whether to offer its
migration-plan control. It SHALL NOT use a role check for that decision.

#### Scenario: A developer's draft response reports true

- **WHEN** an actor holding `system:developer` calls `GET
  /drafts/:processId`
- **THEN** the response carries `canPlanMigration: true`

#### Scenario: An author with no matching grant sees false

- **WHEN** an actor holding only `system:author`, with no scoped `migrate`
  grant for that process, calls `GET /drafts/:processId`
- **THEN** the response carries `canPlanMigration: false`

#### Scenario: An author with a matching grant sees true

- **WHEN** an actor holding only `system:author`, with a scoped `migrate`
  grant for that process, calls `GET /drafts/:processId`
- **THEN** the response carries `canPlanMigration: true`
