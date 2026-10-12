# Design

## Context

See proposal.md for the five findings. The current state that shapes the fix:

- `createServer` returns one async `fetch` closure. Its route loop calls
  `route.handler(...)` with no try (`src/http/server.ts:840`). Most handlers
  wrap their body in `guarded(req, …)`. `handleLogin` and the cascade-loop
  branch of `handleSubmit` do not.
- `Bun.serve` gets `fetch`, `port` and `maxRequestBodySize` only
  (`server.ts:901`). `docker/engine.Dockerfile` sets no `NODE_ENV`. Bun
  therefore runs in development mode. An uncaught throw answers its error
  page with the message embedded.
- Eleven call sites pass `decodeCursor` an arity. The helper checks for an
  array of that many strings. The cursors hold four kinds of value. One is a
  Postgres `created_at::text` timestamp. Two are sequence numbers, cast to
  `int` and to `bigint`. The last is text compared as text.
- `GET /instances` checks `createdAfter` with a private `parseInstant`
  (`routes.ts:437`). The report schema checks nothing. Both reach the same
  `::timestamptz` cast in `buildInstanceWhere` (`queries.ts:318-319`).
- `loadForClaim` throws a plain `Error` for an unknown id
  (`engine/transition.ts:1057`). The change `close-instance-reads-on-write-paths`
  settled the answer for submit and form-draft save. An `ADMIN_ROLE` holder
  gets `NotFoundError`. Everyone else gets the `AuthorizationError` that
  names the actor and the id only. That change left claim, release and
  delegate to this one.

## Goals / Non-Goals

**Goals:**

- No input an HTTP caller controls produces a response that skipped
  `mapError`, and no response is HTML.
- A caller value that Postgres rejects answers 400 before it reaches the
  cast. This covers the sites the audit named.
- Claim, release and delegate answer an unknown id as submit does.

**Non-Goals:**

- Other fields that can hold a NUL byte. They reach Postgres and fail. After
  this change they answer the message-free 500 through the dispatcher catch.
  Naming each one is a separate sweep.
- `isActiveAccount` for external tokens. The external issuer owns
  revocation, as `jwt-authentication` states.
- A configurable algorithm list per issuer. A fixed list is enough until an
  identity provider needs another.
- A 404 for `NotFoundError`. The 500 stays, as the `http-wrapper` spec pins.
- A rewrite of stored report dates. Validation leaves what the caller sent
  as it is.

## Decisions

### 1. One catch in the fetch closure, plus `development: false`

The returned `fetch` closure wraps its whole body in a try. The catch builds
`toResponse(mapError(err, ctx), allowedOrigins, origin)`. One place now
covers `handleLogin`, every future unguarded handler, a `resolveTenantDb`
surprise and the static-asset path.

`Bun.serve` also gets `development: false`, and the engine image sets
`NODE_ENV=production` (owner ruling, 2026-10-12). The first stops the
development page for a server that `bun run serve` starts. The second covers
any other Bun code path that reads `NODE_ENV`.

Alternatives: wrap only `handleLogin` in `guarded`, the audit's first
suggestion. That fixes one route and leaves the next unguarded handler to
repeat the error. A `Bun.serve` `error` option catches the same throws but
cannot attach the CORS headers. Without them the browser cannot read the
500. The dispatcher catch keeps them.

`handleLogin` still gets its own check (decision 2). `handleSubmit`'s
cascade branch gets a local try (decision 3). The dispatcher catch is the
net and not the plan. A test that calls a handler directly needs the handler's
own mapping.

### 2. Reject NUL in the login email before the try count

`handleLogin` returns the existing 400 `request-shape` envelope when
`body.email` includes `"\u0000"`. The check sits right after the type check
and before `checkAndRecordAttempt`. No database query and no count follow.
The count exists to slow password guessing. A request that cannot name an
account guesses nothing.

Alternative: strip the byte and go on. That would log a caller in as an email
they did not type. Rejected.

### 3. Local try around the cascade-loop view read

In `handleSubmit`, the `AutomaticCascadeLoop` branch wraps `getInstanceView`
in its own try and sends the error to `mapError`. The write already
committed. A failed read gets the mapped error, as every other read does.

### 4. JWT: algorithms and `exp`

The local branch passes `algorithms: ["HS256"]` to `jwtVerify`. That is the
only algorithm `login.ts` signs with. The external branch passes a module
constant with the asymmetric algorithms, and `requiredClaims: ["exp"]`. jose
6.2.4 supports both options. The existing catch already maps the error to
`ActorResolutionError`.

Alternative: a per-issuer `algorithms` field in `AUTH_ISSUERS`. That changes
the environment contract for a case nobody has. Rejected.

### 5. Typed cursor positions

`decodeCursor(cursor, kinds)` takes an array of kinds in place of an arity.
The length of the array is the arity. Four kinds exist:

| Kind | Accepts | Used by |
|---|---|---|
| `timestamp` | an ISO-8601 instant, including Postgres's `timestamptz::text` form | listing cursors on `created_at`, outbox, timers |
| `int32` | decimal digits, at most 2147483647 | the record's sequence (`::int`) |
| `int64` | decimal digits, at most 9223372036854775807 | the admin audit sequence (`bigint`) |
| `text` | any string | ids, names, emails, the record's `at` |

The apply task reads each call site's SQL cast and picks the kind from it. A
position compared as text stays `text`.

The `timestamp` check lives in a new `src/instant.ts`, beside the check that
`GET /instances` and the report schema use (decision 6). One function,
`isInstant(raw)`, tells whether a string is an ISO-8601 instant:

1. It matches `YYYY-MM-DD` with an optional time part. The time part is `T` or
   a space, then `HH:MM`, then an optional `:SS` with a fraction, then an
   optional `Z` or `±HH[:MM]`.
2. `Date.parse` does not return `NaN`.
3. The day exists in that month. `Date.parse` rolls `2026-02-30` over to
   March, and Postgres rejects it.

The shape test comes first because the JavaScript parser accepts strings such
as `"1"` that Postgres rejects. A probe in the lane container showed that Bun
parses the Postgres text form `2026-10-11 10:00:00.123456+00` without help.

Alternative: map Postgres data-exception errors (SQLSTATE class 22) to 400 in
`mapError`. That also catches inputs nobody listed. It also turns an engine
bug that makes a bad value, such as an overflow, into a 400 that hides the
bug. Rejected.

Ceiling, in a `ponytail:` comment on `isInstant`: the check knows no leap
seconds and no time zone database. A value that Postgres rejects for those
reasons still answers 500 through `mapError`. The upgrade entry point is
`isInstant` itself.

### 6. One instant check for the list route, the report schema and the cast

`parseInstant` moves from `routes.ts` to `src/instant.ts` and uses
`isInstant`. Three callers share it:

- `GET /instances` (`createdAfter`, `createdBefore`), as before. The shape
  test is stricter than `Date.parse` alone. A value such as `"Oct 11 2026"`
  passed before and now answers 400. The spec text already says "ISO-8601
  instant".
- `reportQuerySchema` refines both bounds with `isInstant`. A bad bound
  raises the existing `RequestShapeError` through `parseBody`. This covers
  create, save, draft preview and column choices.
- `buildInstanceWhere` asserts both bounds before it builds the fragment.
  This is the reject-on-read half of the owner's ruling. A stored report
  with a bad bound answers 400 when it runs, for the owner and for every
  viewer. There is no repair on save: a viewer cannot save, and nothing
  deployed holds such a row.

The assertion in `buildInstanceWhere` also protects the `instance.query`
data source and any later caller of the filter.

### 7. Unknown claim id answers as submit does

`loadForClaim` throws `NotFoundError` (from `src/errors.ts`, where the other
typed errors live) in place of a plain `Error`. The three wrappers in
`runtime/claims.ts` catch a `NotFoundError`. They rethrow what the actor may
see: the `NotFoundError` for an `ADMIN_ROLE` holder, and
`AuthorizationError("actor '<id>' may not act on instance '<id>'")` for
everyone else. A small local helper holds the catch, so the three wrappers do
not repeat it.

The text differs from submit's ("may not submit") because the verb differs.
Both name the actor and the instance id and nothing else, so neither text
reveals whether the instance exists. Claim keeps its order of status before
authority for an instance that exists, as the D-7 design recorded.

Alternative: put the translation in the engine. The engine has no concept of
an actor's roles at that point. Rejected.

## Risks / Trade-offs

- [A stricter instant check turns a date that worked into a 400] → The spec
  already says ISO-8601. The web caller always sends ISO strings. The apply
  task greps the tests and `packages/web` for other shapes.
- [A wrong cursor kind at one call site rejects every real cursor] →
  Each kind comes from the site's SQL cast. The full suite walks every
  paginated listing past one page.
- [A cursor kind narrower than its column rejects a real cursor] → `int32`
  matches the `::int` cast in `record.ts`. The admin audit cursor, a
  `bigint`, takes `int64`.
- [The dispatcher catch hides a bug behind a clean 500] → `mapError` logs the
  message, stack, method and path for every unrecognized throw. That log is
  what the operator reads.
- [`NODE_ENV=production` changes the behavior of another dependency] → The
  image already installs with `--production`. The apply task starts the
  server once with the variable set and runs a login against it.

## Migration Plan

No data migration and no definition contract change. The image gains one
`ENV` line, so a deployment rebuilds the engine image. Rollback is a revert
of the commit. A stored report with an invalid bound keeps its row and
answers 400 until its owner fixes the bound.

## Open Questions

None.
