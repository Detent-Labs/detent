# http-route-handling-consolidation Specification

## Purpose

Structural (mechanism-level) requirements over `src/http/errors.ts`,
`src/http/routes.ts` and `src/http/server.ts`. They keep four
duplications from
re-emerging: table-driven HTTP error mapping, one shared try/catch-and-map
wrapper for route handlers with no extra branching, one implementation
for resolving an `Actor`'s credential from a `Request`, and one table
stating each route's path shape and the HTTP verb that reaches it. These are
implementation-mechanism constraints, not user-visible behavior — the
actual HTTP request/response contract they implement is specified by the
`http-wrapper` capability.

## Requirements

### Requirement: HTTP error mapping is table-driven

`mapError` SHALL determine an error's HTTP status and response body shape
by looking up the thrown value's constructor in shared, ordered mapping
tables (one for the `{type, issues}` body shape, one for `{type, message}`)
rather than through independently-maintained `if (err instanceof X)`
branches per error class. `ConcurrencyConflict` (whose body carries neither
`issues` nor `message`) and the untyped fallback for unrecognized errors
SHALL remain explicit cases outside the tables. Every error class's
resulting status code and response body SHALL be unchanged from
pre-consolidation behavior.

#### Scenario: A validation error with issues maps through the issues table

- **WHEN** the Runtime API Layer throws `SubmissionValidationError`,
  `RegistryValidationError`, `AssignmentRegistryValidationError`,
  `DataSourceRegistryValidationError`, `CelValidationError`,
  `DurationValidationError`, or a `ZodError`
- **THEN** `mapError` returns status 422 and a body of
  `{ error: { type, issues } }` with the same `type` string and the same
  `issues` array the error carries, identical to pre-consolidation output

#### Scenario: A domain error with a message maps through the message table

- **WHEN** the Runtime API Layer throws `RequestShapeError`,
  `CrossProcessValidationError`, `GuardRefused`, `PinMismatch`,
  `ActorResolutionError`, `AuthorizationError`, `NotAssignedError`,
  `NotACandidateError`, `AlreadyClaimedError`, `NotClaimedError`, or
  `NotClaimantError`
- **THEN** `mapError` returns that error's original status code and a body
  of `{ error: { type, message: err.message } }` with the same `type`
  string, identical to pre-consolidation output

#### Scenario: ConcurrencyConflict and unrecognized errors keep their special-cased shape

- **WHEN** the Runtime API Layer throws `ConcurrencyConflict`, or something
  thrown is not one of the mapped error classes
- **THEN** `mapError` returns, respectively, status 409 with
  `{ error: { type: "concurrency-conflict" } }` (no `issues`/`message`
  key), or status 500 with `{ error: { type: "internal", message } }`
  computed from the unrecognized value — both unchanged from
  pre-consolidation output

### Requirement: Route handlers share one try/catch-and-map wrapper

Every exported route handler in `src/http/routes.ts`,
`src/http/admin-routes.ts`, `src/http/studio-routes.ts` and
`src/http/reporting-routes.ts` SHALL delegate to one shared `guarded`
wrapper. This covers a handler whose error handling is "catch anything, map
it via `mapError`" with no branching beyond that. Such a handler SHALL NOT
repeat its own `try { … } catch (err) { return mapError(err); }`.

`guarded` and the `errorContext` helper it calls SHALL have one
implementation, which the sibling route modules import. A module SHALL NOT
carry its own copy of either.

A handler whose catch block does more than call `mapError` keeps its own
explicit try/catch. `handleSubmit` is the only one today. On
`AutomaticCascadeLoop` it re-fetches the view and returns a 200. It falls
back to `mapError` for anything else.

#### Scenario: A handler's business logic throws

- **WHEN** any handler routed through `guarded` throws during its wrapped
  body, for example `handleCreateInstance`, `handleClaim`, `handlePublish`,
  `handleAdminListOutbox` or `handleReportingSla`
- **THEN** the shared wrapper catches it and returns `mapError`'s result,
  identical to what that handler's own try/catch returned before

#### Scenario: A handler's business logic succeeds

- **WHEN** any handler routed through `guarded` completes its wrapped body
  and throws nothing
- **THEN** the shared wrapper returns that body's `HttpResult` unchanged

#### Scenario: handleSubmit's cascade-loop branch keeps its own try/catch

- **WHEN** `submitAndTransition` throws `AutomaticCascadeLoop` inside
  `handleSubmit`
- **THEN** `handleSubmit`'s own try/catch re-fetches the instance view via
  `getInstanceView` and returns it with status 200
- **AND** the shared `guarded` wrapper plays no part in that branch

#### Scenario: A sibling route module carries no copy

- **WHEN** a developer reads `admin-routes.ts`, `studio-routes.ts` or
  `reporting-routes.ts`
- **THEN** each imports `guarded` and `errorContext` from `routes.ts`
- **AND** none of the three declares either name

### Requirement: Credential extraction has one implementation

Resolving an `Actor` from a `Request` SHALL read `req.headers` directly
inside `resolveActor`. No separate `extractCredential` indirection step SHALL
exist.

`resolveActor` SHALL have one implementation across the route modules, which
the sibling modules import. A module SHALL NOT carry its own copy. The same
rule covers `parseLimit`, which reads and validates the `limit` query
parameter.

Neither helper SHALL change its signature. Every existing call site keeps
working unchanged. This requirement governs where the two live and what they
contain, not their callers.

#### Scenario: A handler resolves an actor from request headers

- **WHEN** any route handler calls `resolveActor(req, resolver)`
- **THEN** the call passes `req.headers` to the resolver unchanged
- **AND** it produces the same `Actor`, or throws the same
  `ActorResolutionError`, as before this change

#### Scenario: A sibling route module carries no copy

- **WHEN** a developer reads `admin-routes.ts`, `studio-routes.ts` or
  `reporting-routes.ts`
- **THEN** each imports `resolveActor` from `routes.ts`, and
  `admin-routes.ts` imports `parseLimit` too
- **AND** none of the three declares either name

#### Scenario: An invalid limit is a request error

- **WHEN** a caller sends `limit=abc`, or a `limit` that is not a positive
  integer, to any route that reads one
- **THEN** the one shared `parseLimit` throws `RequestShapeError`, and the
  route answers 400 rather than falling back to a silent default

### Requirement: Route dispatch reads one table

The HTTP wrapper's dispatch SHALL match a request against one ordered table
of route entries. Each entry carries a method, a path pattern, and the
handler to call. Dispatch SHALL NOT restate a route's method or its path
shape in a per-route `if` branch.

The CORS preflight answer SHALL derive from that same table. An `OPTIONS`
request matches by path pattern alone. The answer's
`Access-Control-Allow-Methods` value lists the methods the table holds for
the matched pattern, in table order. No second chain of per-route preflight
branches SHALL exist.

`GET /livez`, `GET /readyz` and `GET /metrics` stay outside the table. All
three answer a probe rather than a browser. None carries a CORS header, and
none answers a preflight.

This constrains the dispatch mechanism, not the routes. The `http-wrapper`,
`admin-operations-api`, `reporting-analytics-api` and `process-drafts`
capabilities hold the routes, their methods, their status codes and their
bodies.

#### Scenario: A request reaches its handler through the table

- **WHEN** a caller sends any request the wrapper routes, for example
  `POST /instances/:instanceId/submit`
- **THEN** the dispatcher takes the first table entry whose method and path
  pattern match
- **AND** it calls that entry's handler with the path parameters the pattern
  captured
- **AND** the response matches the response before this change

#### Scenario: A preflight answer comes from the table

- **WHEN** a browser sends an `OPTIONS` request for a path the table holds
  under two or more methods, for example `/drafts/:processId`
- **THEN** the response is `204` with `Access-Control-Allow-Methods` listing
  every method the table holds for that pattern, joined by `", "` in table
  order
- **AND** no handler runs

#### Scenario: Adding a route adds one table entry

- **WHEN** a developer adds a route to the wrapper
- **THEN** one new table entry is the whole change
- **AND** the preflight for that route answers with no second change

#### Scenario: The probe routes stay outside the table

- **WHEN** a caller sends `OPTIONS /livez`, `OPTIONS /readyz` or
  `OPTIONS /metrics`
- **THEN** the response is the wrapper's ordinary unmatched-route answer,
  not a `204` preflight answer

### Requirement: JSON request-body decoding has one implementation

Reading a JSON request body SHALL run through one shared `readJson(req)` in
`src/http/routes.ts`. That helper decodes the body. It raises
`RequestShapeError` (400) when the body is not valid JSON.

`readJson` SHALL have one implementation, which the sibling route modules
import. A module SHALL NOT carry its own copy. A route SHALL NOT restate
the decode as its own `try { await req.json() } catch { … }` block. The same
rule already governs `guarded`, `errorContext`, `resolveActor` and
`parseLimit`.

`routes.ts::parseJsonBody` SHALL call `readJson` for its own decode step. Its
zod parse and its second `RequestShapeError` stay as they are.

`readJson` decodes. It does not check the decoded value's shape. Its return
type asserts an object, and a caller that needs that guarantee SHALL keep its
own runtime check. The `http-wrapper` requirement titled
`Request bodies are parsed, never cast` governs that half. This requirement
does not relax it.

#### Scenario: A body-reading route gets malformed JSON

- **WHEN** a caller sends a body that is not valid JSON to any route that
  reads one
- **THEN** the shared `readJson` throws `RequestShapeError` and the route
  answers 400 with `error.type` equal to `"request-shape"`

#### Scenario: A sibling route module carries no copy

- **WHEN** a developer reads `admin-routes.ts`, `studio-routes.ts` or
  `account-routes.ts`
- **THEN** each imports `readJson` from `routes.ts`
- **AND** none of the three declares that name
- **AND** none of the three carries a `try { await req.json() } catch { … }`
  block of its own

#### Scenario: The schema-parsing helper reuses the decoder

- **WHEN** a route calls `routes.ts::parseJsonBody(req, schema)` with a body
  that is not valid JSON
- **THEN** the `RequestShapeError` comes from the shared `readJson`, and the
  message is the same one every other body-reading route returns

### Requirement: Version-number parsing has one implementation

Reading a definition version out of a request SHALL run through one shared
`parseVersion(raw, label)` in `src/http/routes.ts`. It accepts `unknown`, so
a path segment and a request-body field both reach it. It raises
`RequestShapeError` (400) with the message `<label> must be an integer` when
the value does not parse to an integer.

`parseVersion` SHALL have one implementation, which the sibling route modules
import. A module SHALL NOT carry its own copy under any name.

#### Scenario: A version path segment is not an integer

- **WHEN** a caller sends `abc` as a `:version`, `:fromVersion` or
  `:toVersion` path segment
- **THEN** the shared `parseVersion` throws `RequestShapeError` and the route
  answers 400 with `error.type` equal to `"request-shape"`

#### Scenario: A version body field is not an integer

- **WHEN** a caller sends a non-integer `fromVersion` or `toVersion` in a
  migration request body
- **THEN** the same shared `parseVersion` throws, and the message names the
  field the caller sent
