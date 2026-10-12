# Proposal

## Why

An anonymous caller can make `POST /auth/login` answer Bun's development
error page. A login email with a NUL byte reaches Postgres, which rejects it.
Nothing between the route and `Bun.serve` catches the error. The server runs
with `development` unset and no `NODE_ENV` in the image. The reply is a 67 KB
`text/html` page that embeds the error message.

Three more inputs end in an unmapped 500. One is a cursor with a wrong
value. One is a saved report with an invalid date. One is a claim on an
unknown id. The JWT check names no algorithm list. It also accepts an external token with no
`exp`. The audit of 2026-10-10 found all five (D-1, D-8, C-10, C-11, C-17).

## What Changes

- Every error that leaves a route handler goes through `mapError`, whatever
  the route. A catch at the dispatcher covers handlers with no guard of their
  own.
- `Bun.serve` runs with `development: false`, and `docker/engine.Dockerfile`
  sets `NODE_ENV=production`. No error path can reach the development page.
- `POST /auth/login` rejects an email with a NUL byte with 400. The check
  runs before the try count and before any database query.
- The cascade-loop branch of `POST /instances/:id/submit` sends a failing
  `getInstanceView` through `mapError`.
- The local JWT branch accepts HS256 only. The external branch accepts
  asymmetric algorithms only and needs `exp`. An external token with no `exp`
  gets 401.
- A pagination cursor has typed positions. `decodeCursor` checks each
  position against its kind (timestamp, integer, text). It raises
  `RequestShapeError` (400) for a value Postgres would reject.
- A saved report's `createdAfter` and `createdBefore` must parse as an
  ISO-8601 instant. Create, save, preview and column choices answer 400 for
  a bad value. A stored report that already has one answers 400 when it runs
  and no longer answers 500.
- `GET /instances` and the report routes share one instant check. A date that
  passes in one place cannot fail in the cast of another.
- Claim, release and delegate on an unknown instance id answer the opaque 403
  to every caller except an `ADMIN_ROLE` holder. Submit and form-draft save
  already give that answer.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `http-wrapper`: a route error always leaves through `mapError`, and the
  server never serves the development error page. The cursor requirement
  checks values. Claim, release and delegate refuse an unknown id with 403.
- `local-user-accounts`: a login email with a NUL byte answers 400.
- `jwt-authentication`: the local branch fixes HS256. The external branch
  fixes an asymmetric list and needs `exp`.
- `reporting-data-tables`: a saved report's date bounds must parse. A stored
  invalid bound answers 400 on run.
- `production-docker-images`: the engine image sets `NODE_ENV=production`.

## Impact

- Code: `src/http/server.ts`, `src/http/routes.ts`,
  `src/http/reporting-routes.ts`, `src/auth/login.ts`, `src/auth/jwt.ts`,
  `src/pagination.ts`, `src/runtime/internal.ts`, `src/runtime/record.ts`,
  `src/runtime/queries.ts`, `src/runtime/claims.ts`,
  `src/engine/transition.ts`, `src/engine/admin-queries.ts`,
  `src/auth/groups.ts`, `src/auth/users.ts`, and a new `src/instant.ts`.
- Image: `docker/engine.Dockerfile`.
- Docs: `docs/openapi.yaml` gets the new 400 and 403 answers. The audit index
  in `docs/decisions.md` strikes this change's entry.
- No schema change, no definition contract change, no new dependency.
