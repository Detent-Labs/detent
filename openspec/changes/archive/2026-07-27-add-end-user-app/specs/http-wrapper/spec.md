## MODIFIED Requirements

### Requirement: Cancel an instance over HTTP

The HTTP wrapper SHALL expose the engine's existing instance cancellation as
`POST /instances/:instanceId/cancel`, resolving the actor through the injected
`ActorResolver` exactly as the other routes do and returning the resulting
instance state.

Cancelling SHALL succeed when the caller's resolved `Actor` carries the
`system:cancel-any` role (see the `authorization` capability), OR when the
target instance's `startedBy` equals the caller's resolved `Actor.id`. The
`system:cancel-any` check SHALL run first and SHALL NOT require loading the
target instance — a role-holding caller SHALL be authorized regardless of
whether the instance exists, is running, or is already terminal, exactly as
before this change. Only when the role is absent SHALL the target instance be
loaded to evaluate the `startedBy` check.

A caller lacking `system:cancel-any` SHALL learn nothing about the target
instance from a failed authorization attempt: an unresolvable instance id and
a resolvable instance whose `startedBy` does not match the caller SHALL both
be rejected identically (`403`, `error.type: "authorization"`), preserving the
pre-existing guarantee that a role-less caller is rejected before any
instance state becomes observable to it, "before" now meaning "without the
rejection differing by instance existence" rather than "without a load
occurring at all."

Cancelling an instance that is not running SHALL succeed as a no-op, since
that is the engine's own semantics, and SHALL NOT be reported as an error.

#### Scenario: Cancelling a running instance

- **WHEN** `POST /instances/:id/cancel` is requested for a running instance
  by an actor carrying the `system:cancel-any` role
- **THEN** the response is 200
- **AND** the instance's status is `cancelled`
- **AND** a cancel history entry has been recorded

#### Scenario: Cancelling an already-cancelled instance

- **WHEN** the same route is requested again for that instance by an actor
  carrying the `system:cancel-any` role
- **THEN** the response is 200 and the instance stays cancelled

#### Scenario: Cancelling without a resolvable credential

- **WHEN** the route is requested with no resolvable credential
- **THEN** the response is 401 and the instance is unchanged

#### Scenario: Cancelling without the required role and not the starter is rejected

- **WHEN** `POST /instances/:id/cancel` is requested by an actor whose
  resolved `Actor.roles` does not include `system:cancel-any` and who is not
  the instance's `startedBy`
- **THEN** the response is 403 with `error.type` equal to `"authorization"`

#### Scenario: The instance's own starter may cancel it without the role

- **WHEN** `POST /instances/:id/cancel` is requested by an actor whose
  resolved `Actor.roles` does not include `system:cancel-any`, and who is the
  target instance's `startedBy`
- **THEN** the response is 200 and the instance's status is `cancelled`

#### Scenario: A non-starter without the role cannot cancel someone else's instance

- **WHEN** `POST /instances/:id/cancel` is requested by an actor who neither
  carries `system:cancel-any` nor started the target instance
- **THEN** the response is 403 with `error.type` equal to `"authorization"`
- **AND** the instance is unchanged

#### Scenario: A role-holding caller is authorized without an instance load

- **WHEN** `POST /instances/:id/cancel` targets an instance id that does not
  exist and the caller carries `system:cancel-any`
- **THEN** the authorization check passes before any instance lookup is
  attempted, matching pre-change behavior

#### Scenario: A role-less caller is rejected identically for a nonexistent instance

- **WHEN** `POST /instances/:id/cancel` targets an instance id that does not
  exist and the caller does not carry `system:cancel-any`
- **THEN** the response is 403 with `error.type` equal to `"authorization"`,
  identical to the response for a resolvable instance the caller neither
  started nor may cancel
