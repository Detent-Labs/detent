<!-- antislop: allow-file em-dash long-words passive-voice run-ons sentence-length synonym-rotation trailing-negation -->
<!-- The MODIFIED block copies live requirement text verbatim; this directive covers that copied text. -->
## MODIFIED Requirements

### Requirement: Typed Runtime API Layer errors map to specific HTTP statuses

The HTTP layer SHALL map each of the following errors thrown by the Runtime
API Layer to the given HTTP status and body shape.

Any other thrown value SHALL map to `500` with `{ error: { type: "internal" } }`
and **no** `message`, and SHALL be logged server-side with its message, its
stack, and the request's method and path. An unrecognized throw carries text
the engine did not choose to expose — a `Bun.sql` error names relations,
columns and constraints; a plugin handler's error names whatever it likes — so
the client learns the request failed and the operator learns why. The
message-free body is the shape `ConcurrencyConflict` already uses.

The Runtime API Layer's not-found conditions ("instance not found", "no
published body for process ...") SHALL be thrown as a typed `NotFoundError`
rather than as plain `Error`s, and SHALL keep mapping to `500` with a message
— unchanged behavior, now pinned to the engine's intent instead of to the
absence of a mapping.

| Thrown | Status | Body |
|---|---|---|
| `SubmissionValidationError` | `422` | `{ error: { type: "validation", issues } }` |
| `GuardRefused` | `409` | `{ error: { type: "guard-refused", message } }` |
| `ConcurrencyConflict` | `409` | `{ error: { type: "concurrency-conflict" } }` |
| `InstanceNotRunningError` | `409` | `{ error: { type: "instance-not-running", message } }` |
| `NotFoundError` | `500` | `{ error: { type: "internal", message } }` |
| `PinMismatch` | `500` | `{ error: { type: "internal", message } }` |
| `RequestShapeError` | `400` | `{ error: { type: "request-shape", message } }` |
| `ActorResolutionError` | `401` | `{ error: { type: "actor-resolution", message } }` |
| `AuthorizationError` | `403` | `{ error: { type: "authorization", message } }` |
| `NotAssignedError` | `403` | `{ error: { type: "not-assigned", message } }` |
| `NotACandidateError` | `403` | `{ error: { type: "not-a-candidate", message } }` |
| `AlreadyClaimedError` | `403` | `{ error: { type: "already-claimed", message } }` |
| `NotClaimedError` | `403` | `{ error: { type: "not-claimed", message } }` |
| `NotClaimantError` | `403` | `{ error: { type: "not-claimant", message } }` |

#### Scenario: A submission validation failure maps to 422
- **WHEN** `POST /instances/:instanceId/submit` data fails field validation
- **THEN** the response is `422` with `error.type` equal to `"validation"`
  and `error.issues` carrying the located issues

#### Scenario: A guard refusal maps to 409
- **WHEN** a submission's target path guard evaluates false against the
  merged data
- **THEN** the response is `409` with `error.type` equal to
  `"guard-refused"`

#### Scenario: A concurrency conflict maps to 409
- **WHEN** a submission's underlying commit raises `ConcurrencyConflict`
- **THEN** the response is `409` with `error.type` equal to
  `"concurrency-conflict"`

#### Scenario: A typed "not found" error maps to 500, not 404
- **WHEN** a request targets an `instanceId` or `processId` that resolves
  to no stored instance or published definition, which the Runtime API
  Layer signals as `NotFoundError`
- **THEN** the response is `500` with `error.type` equal to `"internal"`
  and `error.message` carrying the error text — not `404`

#### Scenario: An unexpected internal failure discloses nothing and is logged
- **WHEN** a route raises a value that matches no mapping — a database error,
  a plugin handler's throw, a programming fault
- **THEN** the response is `500` with `error.type` equal to `"internal"` and
  **no** `error.message`, and the server logs the error, its stack, and the
  request's method and path

#### Scenario: An operation against a non-running instance maps to 409
- **WHEN** a submit, claim or release targets an instance whose status is not
  `running`
- **THEN** the response is `409` with `error.type` equal to
  `"instance-not-running"`, and nothing is written

#### Scenario: An unresolvable credential maps to 401
- **WHEN** a request's credential cannot be resolved by the injected
  `ActorResolver`
- **THEN** the response is `401` with `error.type` equal to
  `"actor-resolution"`

#### Scenario: A resolved actor lacking a required role maps to 403
- **WHEN** a request's resolved `Actor` does not carry the role a route
  requires (`system:publish` for publish, `system:cancel-any` for cancel)
- **THEN** the response is `403` with `error.type` equal to `"authorization"`

#### Scenario: A claim attempt on a step with no declared assignment maps to 403
- **WHEN** `POST /instances/:instanceId/claim` targets a step with no
  declared `assignment`
- **THEN** the response is `403` with `error.type` equal to `"not-assigned"`

#### Scenario: A claim attempt by a non-candidate maps to 403
- **WHEN** `POST /instances/:instanceId/claim` is called by an actor who is
  not an eligible candidate
- **AND** on a test instance, that actor is neither its starter nor a
  `system:admin` holder
- **THEN** the response is `403` with `error.type` equal to
  `"not-a-candidate"`

#### Scenario: A claim attempt on an already-claimed step maps to 403
- **WHEN** `POST /instances/:instanceId/claim` targets a step already
  claimed by a different actor
- **THEN** the response is `403` with `error.type` equal to
  `"already-claimed"`

#### Scenario: A submission to an unclaimed assigned step maps to 403
- **WHEN** `POST /instances/:instanceId/submit` targets a step with a
  declared assignment and no current claim
- **THEN** the response is `403` with `error.type` equal to `"not-claimed"`

#### Scenario: A submission by a non-claimant maps to 403
- **WHEN** `POST /instances/:instanceId/submit` targets a step claimed by a
  different actor
- **THEN** the response is `403` with `error.type` equal to
  `"not-claimant"`

#### Scenario: A release attempt by a non-claimant maps to 403
- **WHEN** `POST /instances/:instanceId/release` is called by an actor who
  does not hold the current claim
- **THEN** the response is `403` with `error.type` equal to
  `"not-claimant"`
