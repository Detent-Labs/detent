## MODIFIED Requirements

### Requirement: Claim the current step of an instance over HTTP

`POST /instances/:instanceId/claim` SHALL resolve the actor via the injected
`ActorResolver` and call `claimStep(instanceId, actor)`. On success it SHALL
return `200 OK` with the write result as the JSON body, with no response
envelope. The body has no `data` member. `runtime-api` states the members of
the write result.

#### Scenario: An eligible candidate claims over HTTP
- **WHEN** a `POST /instances/:instanceId/claim` request resolves to an
  eligible candidate actor and nobody holds the claim on the current step
- **THEN** the response is `200` and the body is the write result reflecting
  the new claim
- **AND** the body has no `data` member

### Requirement: Release a claim on the current step of an instance over HTTP

`POST /instances/:instanceId/release` SHALL resolve the actor via the injected
`ActorResolver` and call `releaseClaim(instanceId, actor)`. On success it SHALL
return `200 OK` with the write result as the JSON body, with no response
envelope. The body has no `data` member. `runtime-api` states the members of
the write result.

#### Scenario: The claimant releases over HTTP
- **WHEN** a `POST /instances/:instanceId/release` request resolves to the
  actor currently holding the claim
- **THEN** the response is `200` and the body is the write result reflecting
  the cleared claim
- **AND** the body has no `data` member

### Requirement: Delegate a claim on the current step of an instance over HTTP

`POST /instances/:instanceId/delegate` SHALL resolve the actor via the
injected `ActorResolver` and parse the JSON body for a `toActorId` string. It
SHALL call `delegateClaim(instanceId, actor, toActorId)`. On success it SHALL
return `200 OK` with the write result as the JSON body, with no response
envelope. The body has no `data` member.

The route SHALL reject an empty or missing `toActorId` as a
`RequestShapeError`, which maps to `400`. This matches `parseJsonBody`'s
existing treatment of `/submit`.

#### Scenario: The claimant delegates over HTTP

- **WHEN** a `POST /instances/:instanceId/delegate` request resolves to
  the actor currently holding the claim, with a valid `toActorId` in the
  body
- **THEN** the response is `200` and the body is the write result reflecting
  the new claimant
- **AND** the body has no `data` member

#### Scenario: A missing `toActorId` is a request-shape error

- **WHEN** a `POST /instances/:instanceId/delegate` request body omits
  `toActorId` or supplies an empty string
- **THEN** the response is `400` with `error.type` equal to
  `"request-shape"`, and `delegateClaim` is not called

### Requirement: Cancel an instance over HTTP

The HTTP wrapper SHALL expose the engine's existing instance cancellation as
`POST /instances/:instanceId/cancel`. The route SHALL resolve the actor through
the injected `ActorResolver`, exactly as the other routes do. It SHALL return
the write result that `runtime-api` defines. The body has no `data` member and
no `startedBy` member.

Cancelling SHALL succeed when the caller's resolved `Actor` carries the
`system:cancel-any` role (see the `authorization` capability). It SHALL also
succeed when the target instance's `startedBy` equals the caller's resolved
`Actor.id`. The `system:cancel-any` check SHALL run first and SHALL NOT require
loading the target instance. A role-holding caller SHALL pass whether the
instance exists, is running, or is already terminal. Only when the role is
absent SHALL the route load the target instance to evaluate the `startedBy`
check.

A caller lacking `system:cancel-any` SHALL learn nothing about the target
instance from a failed authorization try. An unresolvable instance id and
a resolvable instance whose `startedBy` does not match the caller SHALL get the
same rejection: `403`, `error.type: "authorization"`. The rejection does not
differ by instance existence.

Cancelling an instance that is not running SHALL succeed as a no-op, since
that is the engine's own semantics. The route SHALL NOT report it as an error.
The body then carries the instance's `status` and `transitionSeq`, with no
`data`.

A starter whom a revocation names SHALL meet the opaque `403` for a finished
instance. "A write call reveals a finished instance only to a reader" in
`instance-visibility-set` states that rule. The role test and the grant test
sit outside it.

#### Scenario: Cancelling a running instance

- **WHEN** an actor carrying the `system:cancel-any` role requests
  `POST /instances/:id/cancel` for a running instance
- **THEN** the response is 200
- **AND** the body carries `instanceId`, `status` `cancelled` and
  `transitionSeq`, with no `data` member and no `startedBy` member
- **AND** the engine records a cancel history entry

#### Scenario: Cancelling an already-cancelled instance

- **WHEN** an actor carrying the `system:cancel-any` role requests the same
  route again for that instance
- **THEN** the response is 200 and the instance stays cancelled

#### Scenario: Cancelling without a resolvable credential

- **WHEN** a caller requests the route with no resolvable credential
- **THEN** the response is 401 and the instance stays as it was

<!-- antislop: allow passive-voice - the scenario title must match the live spec verbatim, or archive drops it -->
#### Scenario: Cancelling without the required role and not the starter is rejected

- **WHEN** an actor requests `POST /instances/:id/cancel`, the actor's
  resolved `Actor.roles` does not include `system:cancel-any`, and the actor is
  not the instance's `startedBy`
- **THEN** the response is 403 with `error.type` equal to `"authorization"`

#### Scenario: The instance's own starter may cancel it without the role

- **WHEN** the target instance's `startedBy` requests
  `POST /instances/:id/cancel`, and the starter's resolved `Actor.roles` does
  not include `system:cancel-any`
- **THEN** the response is 200 and the body carries `status` `cancelled`

#### Scenario: A non-starter without the role cannot cancel someone else's instance

- **WHEN** an actor who neither carries `system:cancel-any` nor started the
  target instance requests `POST /instances/:id/cancel`
- **THEN** the response is 403 with `error.type` equal to `"authorization"`
- **AND** the instance stays as it was

<!-- antislop: allow passive-voice - the scenario title must match the live spec verbatim, or archive drops it -->
#### Scenario: A role-holding caller is authorized without an instance load

- **WHEN** a caller carrying `system:cancel-any` requests
  `POST /instances/:id/cancel` for an instance id that does not exist
- **THEN** the authorization check passes before any instance lookup runs, as
  it did before this change

<!-- antislop: allow passive-voice - the scenario title must match the live spec verbatim, or archive drops it -->
#### Scenario: A role-less caller is rejected identically for a nonexistent instance

- **WHEN** a caller without `system:cancel-any` requests
  `POST /instances/:id/cancel` for an instance id that does not exist
- **THEN** the response is 403 with `error.type` equal to `"authorization"`.
  It matches the response for a resolvable instance the caller neither
  started nor may cancel

#### Scenario: A cancel-any holder without a read right gets no data

- **WHEN** an actor carrying `system:cancel-any`, who may not read the
  instance, requests the route for a completed instance
- **THEN** the response is 200 and the body carries `status` `completed`
- **AND** the body has no `data` member and no `startedBy` member

#### Scenario: A revoked starter cannot cancel a finished instance

- **WHEN** an administrator revoked the starter of a completed instance
- **AND** the starter has no claim and no candidacy on its current step
- **AND** the starter requests `POST /instances/:id/cancel` for it
- **THEN** the response is 403 with `error.type` equal to `"authorization"`

## ADDED Requirements

### Requirement: A visibility change to an unknown account maps to 422

`UnknownActorError` thrown by a revoke or a grant SHALL map to `422` with
`error.type` equal to `"unknown-actor"`. The response SHALL carry the error's
message, which names the target.

The error has an entry in `src/http/errors.ts`. Without it the response falls
to `500` with a message-free body, and an administrator who mistyped an
account name learns nothing.

A restore SHALL NOT raise the error. `instance-visibility-set` states why.

#### Scenario: A revoke naming an unknown account maps to 422

- **WHEN** an administrator whose own id resolves in the local account
  directory calls `POST /instances/:instanceId/visibility/revoke`
- **AND** the `actorId` it names does not resolve there
- **THEN** the response is `422` with `error.type` equal to `"unknown-actor"`
- **AND** the body carries a message naming the target

#### Scenario: A grant naming an unknown account maps to 422

- **WHEN** the same administrator calls
  `POST /instances/:instanceId/visibility/grant` for an unknown account
- **THEN** the response is `422` with `error.type` equal to `"unknown-actor"`

### Requirement: The visibility routes refuse an unknown instance as they refuse an unauthorized caller

The three visibility routes SHALL answer an instance id that resolves to
nothing with `403` and `error.type` equal to `"authorization"`. That is the
answer a known instance gives a caller without standing. The message text
SHALL read the same whether the instance exists or not.

Before this requirement, an unknown id reached `mapError` as a `NotFoundError`
and answered `500` with the id in the message.

#### Scenario: An unknown instance id maps to 403

- **WHEN** any caller calls a visibility route with an instance id that
  resolves to nothing
- **THEN** the response is `403` with `error.type` equal to `"authorization"`

#### Scenario: A known instance without standing maps to the same 403

- **WHEN** a caller without standing calls a visibility route for a known
  instance
- **THEN** the response is `403` with `error.type` equal to `"authorization"`
- **AND** the body is identical to the body for an unknown instance id
