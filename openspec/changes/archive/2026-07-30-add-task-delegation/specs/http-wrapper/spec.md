<!-- antislop: allow-file passive-voice -->
## ADDED Requirements

### Requirement: Delegate a claim on the current step of an instance over HTTP

`POST /instances/:instanceId/delegate` SHALL resolve the actor via the
injected `ActorResolver` and parse the JSON body for a `toActorId`
string. It SHALL call `delegateClaim(instanceId, actor, toActorId)` and,
on success, return `200 OK` with the resulting `Instance` as the JSON
body, with no response envelope. An empty or missing `toActorId` SHALL be
rejected as a `RequestShapeError`, mapped to `400`. This matches
`parseJsonBody`'s existing treatment of `/submit`.

#### Scenario: The claimant delegates over HTTP

- **WHEN** a `POST /instances/:instanceId/delegate` request resolves to
  the actor currently holding the claim, with a valid `toActorId` in the
  body
- **THEN** the response is `200` and the body is the `Instance` reflecting
  the new claimant

#### Scenario: A missing `toActorId` is a request-shape error

- **WHEN** a `POST /instances/:instanceId/delegate` request body omits
  `toActorId` or supplies an empty string
- **THEN** the response is `400` with `error.type` equal to
  `"request-shape"`, and `delegateClaim` is not called

### Requirement: A non-claimant's delegation try maps to 403

`NotClaimantError` thrown by `delegateClaim` SHALL map to `403` with
`error.type` equal to `"not-claimant"`, the same mapping `/release`
already uses for the same error.

#### Scenario: A non-claimant's delegation try maps to 403

- **WHEN** a caller who does not hold the current claim calls
  `POST /instances/:instanceId/delegate`
- **THEN** the response is `403` with `error.type` equal to
  `"not-claimant"`

### Requirement: The delegate route answers CORS preflight requests

The HTTP wrapper SHALL handle `OPTIONS /instances/:instanceId/delegate`
requests as a CORS preflight, matching the existing claim and release
routes. It SHALL respond `204 No Content` with the standard CORS headers,
without invoking `delegateClaim`.

#### Scenario: Preflighting the delegate route

- **WHEN** an `OPTIONS /instances/:instanceId/delegate` request is made
- **THEN** the response is `204` with the CORS headers, and `delegateClaim`
  is not invoked

### Requirement: An operation against a non-running instance maps to 409

A delegation try against an instance whose status is not `running` SHALL
map to `409`, with `error.type` equal to `"instance-not-running"`. This
matches submit, claim, and release.

#### Scenario: A delegation against a non-running instance maps to 409

- **WHEN** `POST /instances/:instanceId/delegate` targets an instance
  whose status is not `running`
- **THEN** the response is `409` with `error.type` equal to
  `"instance-not-running"`
