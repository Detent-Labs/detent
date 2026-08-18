## ADDED Requirements

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
