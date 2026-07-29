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

## ADDED Requirements

### Requirement: Request bodies are parsed, never cast

Every route that reads a JSON request body SHALL parse it against a schema
and raise `RequestShapeError` (400) on a mismatch, including when the body is
not valid JSON at all. No route SHALL cast a parsed body to a type without
checking it.

Today `POST /processes/:processId/instances` and
`POST /instances/:instanceId/submit` both cast. The consequences are traced:
a submit with no `data` reaches the validator, whose `Object.keys(data)`
throws a `TypeError` mapped to 500; and malformed JSON throws a `SyntaxError`
mapped to 500 — while `POST /processes` and `POST /auth/login` map exactly the
same condition to 400. The same client error therefore produces different
statuses on different routes, which makes an operator unable to distinguish an
engine defect from a bad request, and fires server-fault alerts on caller
mistakes.

The parse SHALL be shallow: it checks the envelope the route destructures
(`pathId` present and a string; `data` an object, defaulting to empty;
`version` a positive integer when present). Field-level validation stays in
the Runtime API Layer, so a rule is not defined in two places.

#### Scenario: A submit with no pathId is a 400

- **WHEN** `POST /instances/:instanceId/submit` is called with a body lacking
  `pathId`
- **THEN** the response is `400` with `error.type` equal to `"request-shape"`,
  and nothing is written

#### Scenario: A submit with no data is a 400

- **WHEN** the same route is called with a `pathId` but no `data`
- **THEN** the response is `400` — or the body is accepted with an empty
  `data`, per the declared default — never a `500`

#### Scenario: Malformed JSON is a 400 on every route

- **WHEN** any body-reading route is called with a body that is not valid JSON
- **THEN** the response is `400` with `error.type` equal to `"request-shape"`,
  the same answer `POST /processes` and `POST /auth/login` already give

#### Scenario: A create with a malformed version is a 400

- **WHEN** `POST /processes/:processId/instances` is called with `version` as
  a string, a negative number or a non-integer
- **THEN** the response is `400`

### Requirement: A malformed pagination cursor is a client error

A `cursor` query parameter SHALL be validated before use: it is base64url of a
JSON array of strings of the arity its route encodes. A cursor that fails to
decode, fails to parse, or decodes to a different shape SHALL raise
`RequestShapeError` (400).

A cursor is client-controlled input that is currently `JSON.parse`d without a
check and whose elements are interpolated into Postgres casts, so a
truncated, URL-mangled or hand-edited cursor answers `500` on routes a UI
drives on every scroll — and the `internal` type prevents an operator from
telling a bad cursor from an engine fault.

Validation SHALL be shallow, and a cursor whose *values* are stale or point
past the end SHALL remain a legitimate empty page rather than an error —
keyset pagination has always had that property.

The encode/decode helper pair SHALL exist once and be imported by both
callers, rather than being fixed in each of its two current copies.

#### Scenario: A non-base64 cursor is a 400

- **WHEN** `GET /instances?cursor=%%%` is requested
- **THEN** the response is `400` with `error.type` equal to `"request-shape"`

#### Scenario: A well-formed but wrong-shaped cursor is a 400

- **WHEN** a cursor decodes to valid JSON that is not an array of the expected
  number of strings
- **THEN** the response is `400`

#### Scenario: A stale cursor is still a valid request

- **WHEN** a cursor is well-formed but points past the end of the result set
- **THEN** the response is `200` with an empty page, unchanged from today

#### Scenario: Both paginated surfaces behave identically

- **WHEN** a malformed cursor is sent to the instance listing and to an
  admin-queries-backed listing
- **THEN** both answer `400`, because both use the same validated helper
