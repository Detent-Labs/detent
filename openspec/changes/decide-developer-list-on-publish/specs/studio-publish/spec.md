## MODIFIED Requirements

<!-- Why: a MODIFIED heading must match the base spec word for word, so the heading cannot change. -->
<!-- antislop: allow passive-voice trailing-negation -->
### Requirement: A saved draft is published through a dedicated route that targets the persisted draft, not the in-browser edit state

`POST /drafts/:processId/publish` SHALL need one of `system:developer` and
`system:author`. It SHALL additionally need `can(actor, "publish", processId,
db)` to answer true. A grant of `"publish"` scoped to that process therefore
substitutes for the global `system:publish`. The authoring role still stands
beside it. Neither authoring role implies anything else, as
`process-drafts` already established. Publishing from Studio therefore stays
gated exactly as publishing from anywhere else.

An actor who does not hold `ADMIN_ROLE` SHALL also appear on the process's
Developer list, per the `process-access-roles` capability. That check follows
the two checks above. It does not apply when the process has no draft and no
published version. `ADMIN_ROLE` passes it with no list entry.

The route reads its `processId` from the path, so the gate does not need a body. It
SHALL run before the handler reads the draft.

The handler SHALL read the persisted draft (`getDraft`). It SHALL pass that
`body` unchanged to the existing `publishBody`. It SHALL return `{processId,
version, definitionHash, status}`. It SHALL NOT accept a body in the request.
The caller has nothing to supply beyond the process id, since the stored draft
is the source of truth.

#### Scenario: Publishing uses the persisted draft's body

- **WHEN** a caller posts `POST /drafts/:processId/publish` for a process with
  a saved draft
- **THEN** the handler passes that draft's stored `body` to `publishBody`
- **AND** the response carries the resulting version and `definitionHash`

#### Scenario: The engine rejects a caller with only system:developer

- **WHEN** an actor holding `system:developer` but not `system:publish` calls
  the publish route
- **AND** no grant admits that actor for that process
<!-- antislop: allow synonym-rotation -->
<!-- Why: "error" here is the HTTP authorization error the route returns; "issue" elsewhere is a validation finding, an unrelated concept. -->
- **THEN** the engine answers with the same authorization error `POST
  /processes` already returns for a caller lacking `system:publish`

#### Scenario: The engine rejects a caller with only system:author

- **WHEN** an actor holding `system:author` but not `system:publish` calls the
  publish route
- **AND** no grant admits that actor for that process
- **THEN** the engine answers with that same authorization error

#### Scenario: The engine rejects a caller with only system:publish

- **WHEN** an actor holding `system:publish` but neither `system:developer` nor
  `system:author` calls the publish route
- **THEN** the engine rejects the call, since every studio route needs an
  authoring role whatever else the actor holds

#### Scenario: An author holding the publish role publishes

- **WHEN** an actor holding `system:author` and `system:publish` calls the
  publish route for a process with a saved draft
- **THEN** the publish succeeds and the response carries the new version

#### Scenario: An author holding a grant publishes their own process

- **WHEN** an actor holding `system:author` but not `system:publish` calls the
  publish route
- **AND** the store holds a grant of `"publish"` to a role that actor holds
- **AND** that grant names that `processId` in its scope
- **THEN** the publish succeeds and the response carries the new version

#### Scenario: That same grant publishes no other process

- **WHEN** that same actor calls the publish route for a different process
  with a saved draft
- **THEN** the engine answers with the authorization error

<!-- Why: a MODIFIED block keeps each base scenario name word for word, or archive drops the scenario. -->
<!-- antislop: allow negation-habit -->
#### Scenario: A grant carries no authoring role

- **WHEN** an actor holding that grant, and neither `system:developer` nor
  `system:author`, calls the publish route
- **THEN** the engine rejects the call, since a grant reaches the publish
  permission and never a studio route's own gate

#### Scenario: Publishing a process with no draft is a 404

- **WHEN** a caller posts `POST /drafts/:processId/publish` for a `processId`
  with no row in `drafts`
- **THEN** the response is 404, the same not-found shape
  `GET /drafts/:processId` already returns


#### Scenario: A publisher off the Developer list gets 403

- **WHEN** an actor holding `system:author` and `system:publish` calls the
  publish route for a process that has a saved draft
- **AND** the actor is not on that process's Developer list
- **THEN** the response is 403 with `error.type` equal to `"authorization"`
- **AND** the store persists no version and the draft stays unpublished

#### Scenario: A group member on the Developer list publishes

- **WHEN** an actor holding `system:author` and `system:publish` belongs to a
  group on that process's Developer list
- **AND** the actor calls the publish route
- **THEN** the publish succeeds

#### Scenario: An admin publishes without a list entry

- **WHEN** an actor holding `system:admin`, `system:author` and
  `system:publish` calls the publish route
- **AND** the actor is not on that process's Developer list
- **THEN** the publish succeeds
