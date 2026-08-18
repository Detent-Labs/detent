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

### Requirement: A role-gated route handler composes through one wrapper

`src/http/routes.ts` SHALL export one `route(req, resolver, db, gate, fn)`
combinator. Its body SHALL be a single call to the existing `guarded(req,
callback)`. That call makes `guarded` the outermost call. Its existing
`mapError` therefore covers every step that follows.

That `callback` SHALL call the existing `resolveActor(req, resolver, db)`
first. It SHALL then call the caller-supplied `gate(actor)` with the resolved
`Actor`. It SHALL then call `fn(actor)`. Each step SHALL run only once the
previous step has neither thrown nor rejected.

A handler that needs only "resolve the actor, then check a role" SHALL call
`route`, passing a `requireRole` invocation as its `gate`. It SHALL NOT
restate `resolveActor` followed by a separate `requireRole`/
`requireStudioRead`/`requireAuthoring` call as its own two-line preamble.

`route` and `resolveActor` stay two separate exports. The helper
`resolveActor` keeps its existing signature and behavior, governed by the
credential-extraction requirement above. `route` composes on top of
`resolveActor`. It does not replace it.

Some gates need the request body, not just the resolved actor. `POST
/processes` is one example. Its `requirePermission` check needs the body's
`processId`. A handler with such a gate SHALL keep its own inline
`resolveActor` call. `route` covers only the actor-only gate case. It does
not become the only path through `resolveActor`.

#### Scenario: A gate rejects the resolved actor

- **WHEN** a handler routed through `route` supplies a `gate` that throws
  `AuthorizationError` for the resolved `Actor`
- **THEN** `route` returns the mapped `403` response
- **AND** `fn` never runs

#### Scenario: A gate accepts the resolved actor

- **WHEN** a handler routed through `route` supplies a `gate` that does not
  throw for the resolved `Actor`
- **THEN** `fn` runs with that `Actor`
- **AND** the response carries `fn`'s own result, wrapped by the same
  `guarded` error mapping every other handler already gets

#### Scenario: route rejects an unresolvable credential before the gate runs

- **WHEN** a request routed through `route` carries no credential the
  injected `ActorResolver` can resolve
- **THEN** `route` returns `401`
- **AND** neither `gate` nor `fn` runs

#### Scenario: A sibling route module carries no copy of the preamble

- **WHEN** a developer reads `admin-routes.ts`, `studio-routes.ts` or
  `reporting-routes.ts` for a handler needing only an actor-scoped role check
- **THEN** that handler calls `route`, passing its role check as `gate`
- **AND** it does not itself call `resolveActor` followed by a separate role
  check

### Requirement: A "not found" HTTP response comes from one shared helper

`src/http/errors.ts` SHALL export `notFound(message: string): HttpResult`. It
SHALL return `{ status: 404, body: { error: { type: "not-found", message }
} }`.

A route handler that needs to answer "not found" SHALL call `notFound`
rather than write that object literal itself. No route module SHALL carry
its own copy of the literal. A copy can sit inline at a call site. A copy
can also sit inside a local helper of the module's own, for example a
`notFoundList(key)`-shaped wrapper. Both forms count. A local wrapper
around the literal is still a copy of the literal.

#### Scenario: A handler answers not-found through the shared helper

- **WHEN** any route handler in `studio-routes.ts`, `admin-routes.ts`,
  `server.ts` or `reporting-routes.ts` needs to answer "not found"
- **THEN** it returns `notFound(message)`
- **AND** the response carries `404` with `error.type` equal to
  `"not-found"` and `error.message` equal to the message passed in
- **AND** that response matches the hand-written literal it replaces

#### Scenario: No module carries its own literal

- **WHEN** a developer reads `studio-routes.ts`, `admin-routes.ts`,
  `server.ts` or `reporting-routes.ts`
- **THEN** none of them declares a `{ status: 404, body: { error: { type:
  "not-found", ... } } }` object literal of its own
- **AND** none of them declares a local wrapper that returns that literal
  under a different name

### Requirement: A route handler's `db` parameter carries no default

Every exported route handler whose signature includes a `db: SQL`
parameter SHALL declare that parameter with no default value: `db: SQL`, not
`db: SQL = sql`.

This spans every handler across `src/http/routes.ts`,
`src/http/admin-routes.ts`, `src/http/studio-routes.ts`,
`src/http/reporting-routes.ts` and `src/http/account-routes.ts`, plus
`src/auth/login.ts`'s `handleLogin`. It also spans the handlers the two
requirements below fold into those modules. `createServer` SHALL keep
passing its own `db` explicitly to every handler it wires, `handleLogin`
included. Removing the default therefore changes no runtime behavior for
any request the server serves.

`src/http/server.ts` carries two further `db: SQL = sql` defaults:
`createServer`'s own `processDb`, and `startHttpServer`'s `db`. Neither is
a route handler dispatched per request. Instead, `createServer`'s
`processDb` seeds every request-handling closure `createServer` builds. It
is the value a single-tenant deployment's requests fall back to.

`startHttpServer` is the production bootstrap entry point. Both SHALL drop
their default, for the same reason a route handler does.
`startHttpServer`'s own call to `createServer` already supplies `db`
explicitly where `processDb` sits, so that call site needs no change.
`startHttpServer`'s own single call site
(`server.ts`'s `if (import.meta.main) startHttpServer(...)`) SHALL supply
its `db` argument explicitly, in this same change, not a later one.

#### Scenario: A caller must supply db explicitly

- **WHEN** a developer calls a route handler directly, outside
  `createServer`'s wiring
- **THEN** omitting the `db` argument fails `tsc`
- **AND** the call does not silently fall back to the module-level `sql`
  connection

#### Scenario: The server's own wiring keeps working

- **WHEN** `createServer` dispatches an incoming request to any route
  handler
- **THEN** the handler receives the same `db` connection it received before
  this change
- **AND** the handler returns the same response it returned before this
  change

### Requirement: The UI-strings read handler lives beside its admin sibling

`handleGetUiStrings` (the `GET /ui-strings` handler) SHALL live in
`src/http/admin-routes.ts`, beside `handleAdminListUiStrings`, whose response
body it duplicates. `src/http/ui-strings-routes.ts` SHALL NOT exist as a
separate module.

This requirement moves only where the handler's code lives. The route keeps
its method, its path and its response shape. It keeps its exemption from
actor resolution and from role checks; see the `ui-string-overrides`
capability for that exemption's own terms.

#### Scenario: The handler moves, the route does not change

- **WHEN** a client requests `GET /ui-strings`
- **THEN** the response matches the response before this change
- **AND** no actor resolution or role check runs, exactly as before

#### Scenario: The dedicated module is gone

- **WHEN** a developer looks for `src/http/ui-strings-routes.ts`
- **THEN** the file does not exist
- **AND** `src/http/admin-routes.ts` exports `handleGetUiStrings`

### Requirement: The liveness and readiness handlers live in server.ts

`checkDbReady`, `handleLivez` and `handleReadyz` SHALL live in
`src/http/server.ts`, beside the special-cased branches that call them.
`src/http/health.ts` SHALL NOT exist as a separate module.

This requirement moves only where these three exports' code lives. Both
`GET /livez` and `GET /readyz` keep every behavior the `http-wrapper`
capability specifies for them. Neither resolves an actor. Neither carries a
CORS header. They keep the exemption this capability's own dispatch-table
requirement already states.

#### Scenario: The probes move, their behavior does not change

- **WHEN** a client requests `GET /livez` or `GET /readyz`
- **THEN** the response matches the response before this change
- **AND** the route stays outside the dispatch table
- **AND** `CORS_ALLOWED_ORIGINS` still does not affect either route

#### Scenario: The dedicated module is gone

- **WHEN** a developer looks for `src/http/health.ts`
- **THEN** the file does not exist
- **AND** `src/http/server.ts` exports `checkDbReady`, `handleLivez` and
  `handleReadyz`
