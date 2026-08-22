# http-wrapper

## ADDED Requirements

### Requirement: Save an instance form draft over HTTP

`PUT /instances/:instanceId/draft` SHALL resolve the actor via the injected
`ActorResolver`, accept a JSON body `{ data }`, call
`saveInstanceDraft(instanceId, data, actor)`, and on success return `200 OK`
with the saved draft's `{ updatedBy, updatedAt }` as the JSON body, with no
response envelope. An absent `data` field SHALL default to `{}`, the same
default the submit route's body schema applies. The route SHALL map the
runtime operation's errors the same way the submit route maps its own.

#### Scenario: A claimant's draft saves

- **WHEN** a `PUT /instances/:instanceId/draft` request resolves to the
  current claimant and carries a data object
- **THEN** the response is `200` and the body carries the saving actor and the
  save time

#### Scenario: An unresolvable credential is rejected before the operation

- **WHEN** a `PUT /instances/:instanceId/draft` request carries no resolvable
  credential
- **THEN** the route short-circuits before calling `saveInstanceDraft`

#### Scenario: A non-object data body is refused

- **WHEN** a `PUT /instances/:instanceId/draft` request carries a data body
  that is not a JSON object
- **THEN** the response is `400` and the runtime stores no draft

#### Scenario: A missing data field saves an empty draft

- **WHEN** a `PUT /instances/:instanceId/draft` request carries a body with no
  `data` field
- **THEN** the route treats `data` as `{}` and saves an empty draft for the
  instance's current step
