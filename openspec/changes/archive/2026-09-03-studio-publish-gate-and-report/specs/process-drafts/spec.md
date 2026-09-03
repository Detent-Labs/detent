## ADDED Requirements

### Requirement: GET /drafts/:processId reports whether the caller may publish

The response of `GET /drafts/:processId` SHALL carry one further added field,
`canPublish: boolean`. The engine SHALL compute this field from
`can(actor, "publish", processId, db)`, using the resolved actor and the
route's own `processId`. See the `authorization` capability for that
predicate.

The `canPlanMigration` field already takes this shape on the same response.
The engine computes it the same way, for the neighbouring permission.
The studio edit screen SHALL read the new field to decide whether to offer
its Publish control. It SHALL NOT use a role check for that decision.
Neither authoring role implies the publish permission, and a scoped grant
reaches that permission without either role.

The field decides what a client renders. It SHALL NOT relax the publish
route's own gate, which stays exactly as `studio-publish` specifies.

#### Scenario: A developer holding the publish role reads true

- **WHEN** an actor holding `system:developer` and `system:publish` calls
  `GET /drafts/:processId`
- **THEN** the response carries `canPublish: true`

#### Scenario: A developer without the publish role reads false

- **WHEN** an actor holding `system:developer`, without `system:publish` and
  with no scoped `publish` grant for that process, calls
  `GET /drafts/:processId`
- **THEN** the response carries `canPublish: false`

#### Scenario: An author with no matching grant reads false

- **WHEN** an actor holding only `system:author`, with no scoped `publish`
  grant for that process, calls `GET /drafts/:processId`
- **THEN** the response carries `canPublish: false`

#### Scenario: An author with a matching grant reads true

- **WHEN** an actor holding only `system:author`, with a scoped `publish`
  grant naming that process, calls `GET /drafts/:processId`
- **THEN** the response carries `canPublish: true`

#### Scenario: That same grant reads false for another process

- **WHEN** that same actor calls `GET /drafts/:processId` for a different
  process with a saved draft
- **THEN** the response carries `canPublish: false`
