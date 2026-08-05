## MODIFIED Requirements

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
