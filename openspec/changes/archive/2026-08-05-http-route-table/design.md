## Context

`createServer` in `src/http/server.ts` returns one closure. That closure
holds `resolver`, `db`, `registry`, `dataSourceRegistry`,
`assignmentRegistry`, `loginSecret`, `webRoot` and `allowedOrigins`. Each
route handler reads a different subset of those, in a different order.

The handlers share no signature:

```ts
handleListInstances(req, resolver, db)
handleSubmit(instanceId, req, resolver, dataSourceRegistry, db, assignmentRegistry)
handleGetMigrationPlan(processId, fromVersion, toVersion, req, resolver, db)
```

Any table therefore stores a closure per route, never a bare handler
reference.

Three routes sit outside CORS today. `GET /livez`, `GET /readyz` and
`GET /metrics` call `toResponse` and `toBinaryResponse` with an `undefined`
allowed-origins argument. No `Access-Control-*` header can reach them,
whatever `CORS_ALLOWED_ORIGINS` holds.

Two branches bracket the routes. The wrapper answers a browser navigation
from the web root before it matches a route. Three paths need that order:
`/admin/outbox`, `/admin/timers` and `/admin/users`. Each names an admin
area screen and an admin API route. The wrapper serves static assets after
every route, so it
reserves no URL prefix.

Thirty-five tests assert an exact `Access-Control-Allow-Methods` string.
Five of them assert a multi-method value: `"GET, POST"`, `"GET, PUT"` and
`"GET, PUT, DELETE"`.

## Goals / Non-Goals

**Goals:**

- One statement of each route's method and path shape in `createServer`.
- A preflight answer computed from the routes, not restated beside them.
- Byte-identical responses on every route that has one today. That includes
  the exact `Access-Control-Allow-Methods` strings.
- `OPTIONS` on the four `/reporting/*` routes answers `204`, which the
  `http-wrapper` spec already requires.

**Non-Goals:**

- No HTTP framework. `Bun.serve` and a plain `fetch(req)` stay, per the
  file's own header comment about low lock-in.
- No change to any route handler, to `routes.ts`, to the four route modules,
  to `health.ts` or to `metrics.ts`.
- No path syntax beyond `:name` segments. No wildcards, no optional
  segments, no regular expressions. The wrapper needs none of them.
- No route added, removed, renamed or re-authorized.
- No change to `docs/openapi.yaml`. It documents no `OPTIONS` operation, and
  it already records that `/metrics` does no CORS handling.

## Decisions

### The table holds a closure, not a handler reference

```ts
type Route = {
  method: string;
  segments: string[];   // "instances", ":instanceId", "submit"
  handler: (params: string[], req: Request) => Promise<HttpResult | HttpBinaryResult>;
};
```

`createServer` builds the array once per call, outside the returned `fetch`.
Each entry closes over what its route reads:

```ts
{ method: "POST", segments: seg("/instances/:instanceId/submit"),
  handler: (p, req) => handleSubmit(p[0]!, req, resolver, dataSourceRegistry, db, assignmentRegistry) },
```

Positional `params` beats a named record. Every handler already takes its
path values positionally. A record would add a name at the table and strip it
again at the call.

Two alternatives lost. A shared handler signature forces a rewrite of every
handler in four modules, which the proposal rules out. A structure keyed by
method and then by path needs a second structure for the preflight. That is
the duplication this change removes.

### Matching compares segments, and the first match wins

`seg(pattern)` splits on `/` and drops empties. It runs once, when
`createServer` builds the table. A segment that starts with `:` marks a path
value.

`match(segments, parts)` returns the captured path values, or `null`. It
requires equal length first. It then compares each literal segment. That is
the test the if-chain runs today, read from data rather than written out.

No two patterns in the table overlap. Any two differ in segment count or in
a literal segment. Order therefore decides no match. The table keeps source
order anyway, so the file still reads top to bottom like the chain it
replaces.

### The preflight reads the table by path alone

On `OPTIONS`, the dispatcher collects every entry whose segments match. It
answers `204` with those entries' methods, joined by `", "`.

Three patterns must emit `"GET, POST"`. The current handler chain lists
`POST` first for `/processes`, `/instances/:instanceId/comments` and
`/instances/:instanceId/attachments`. Their table entries list `GET` first,
so the join reproduces the string the tests pin. Method is part of the match,
so the reorder decides no dispatch.

An `OPTIONS` request that matches no pattern falls through to the static
branch and then to the 404, as it does today.

### The login route enters the table conditionally

The table carries `POST /auth/login` only when `loginSecret` holds a value.
It spreads a one-element array then, and an empty array otherwise:

```ts
...(loginSecret ? [{ method: "POST", segments: seg("/auth/login"), handler: ... }] : []),
```

The preflight then follows for free. With no secret, no entry names the path,
so `OPTIONS /auth/login` gets the 404 it gets today.

### The binary check moves to the dispatcher

`handleGetAttachment` returns `HttpBinaryResult | HttpResult`. Today one
route branches on `isBinaryResult`. The table has one exit path, so the
dispatcher runs that check on every result. One branch replaces one special
case, and a second binary route later needs no new code.

### The three probe routes stay out of the table

`GET /livez`, `GET /readyz` and `GET /metrics` keep their explicit `if`
branches ahead of the table. All three pass an `undefined` allowed-origins
argument, which no table entry does. Three lines of special case state that
plainly. Folding them in needs a per-entry "no CORS" flag, which is more
machinery than the case is worth.

The spec change records this. The `http-wrapper` requirement named
`GET /livez` and `GET /readyz` only. `GET /metrics` behaved the same way and
the text did not say so.

### The reporting preflight gap closes as a consequence

The four `/reporting/*` routes have no preflight branch today. Deriving the
answer from the table gives them one. The proposal names this behavior
change, and the `http-wrapper` spec already required it.

## Risks / Trade-offs

- **A missed route gives a 404, not a wrong answer.** A transcription error
  makes a route stop matching. The http test suites exercise every route, so
  a dropped entry fails a named test rather than passing quietly. The
  typecheck catches it earlier: `tsconfig.json` sets `noUnusedLocals`, so a
  handler no table entry names leaves an unused import and fails
  `bun run typecheck`.
- **A wrong closure passes wrong arguments.** Transcribing 49 closures is the
  real error risk here. TypeScript catches an argument of the wrong type or
  count. It does not catch two path values swapped. Only three routes take
  more than one path value:
  `/migration-plans/:processId/:fromVersion/:toVersion`,
  `/processes/:processId/versions/:version` and
  `/instances/:instanceId/attachments/:attachmentId`. Each of the three has a
  test that reads the response body.
- **The preflight method order is now derived.** A hand wrote it before. A
  future route added in the wrong position changes a header string a test
  pins. That test failing is the intended signal.
- **`/reporting/*` starts answering `OPTIONS`.** The four routes are
  `GET`-only and read-only. A `204` with `Access-Control-Allow-Methods: GET`
  grants nothing that `GET` did not already grant to an allowed origin.

## Migration Plan

None. No stored data, no persisted definition, no HTTP contract and no
configuration key changes. The change touches `createServer` and nothing
else.

Rollback is `git revert` of the single commit.

## Open Questions

None. The route set, the handler signatures and the header strings all read
off the current file and its tests.
