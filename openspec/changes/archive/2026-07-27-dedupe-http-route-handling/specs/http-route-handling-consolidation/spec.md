## ADDED Requirements

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

Every exported route handler in `src/http/routes.ts` whose error handling
is "catch anything, map it via `mapError`" with no additional branching
SHALL delegate to one shared `guarded` wrapper rather than repeating its
own `try { … } catch (err) { return mapError(err); }`. A handler whose
catch block does more than call `mapError` (currently only `handleSubmit`,
which re-fetches and returns a 200 view on `AutomaticCascadeLoop` before
falling back to `mapError`) SHALL keep its own explicit try/catch instead
of using the shared wrapper.

#### Scenario: A handler's business logic throws

- **WHEN** any handler routed through `guarded` (e.g. `handleCreateInstance`,
  `handleClaim`, `handlePublish`) throws during its wrapped body
- **THEN** the shared wrapper catches it and returns `mapError`'s result,
  identical to what that handler's own try/catch previously returned

#### Scenario: A handler's business logic succeeds

- **WHEN** any handler routed through `guarded` completes its wrapped body
  without throwing
- **THEN** the shared wrapper returns that body's `HttpResult` unchanged

#### Scenario: handleSubmit's cascade-loop branch is unaffected

- **WHEN** `submitAndTransition` throws `AutomaticCascadeLoop` inside
  `handleSubmit`
- **THEN** `handleSubmit`'s own try/catch (not the shared `guarded`
  wrapper) re-fetches the instance view via `getInstanceView` and returns
  it with status 200, exactly as before this change

### Requirement: Credential extraction has one implementation

Resolving an `Actor` from a `Request` SHALL read `req.headers` directly
inside `resolveActor`, with no separate `extractCredential` indirection
function. Every existing `resolveActor` call site SHALL be unaffected —
this requirement governs `resolveActor`'s internals, not its signature or
callers.

#### Scenario: An actor is resolved from request headers

- **WHEN** any route handler calls `resolveActor(req, resolver)`
- **THEN** the resolver is invoked with `req.headers` unchanged, producing
  the same `Actor` (or throwing the same `ActorResolutionError`) as before
  this change
