## Why

`src/http/` has no published contract document. A customer's own system
needs one to integrate against the engine directly, instead of only through
`packages/app`/`admin`/`studio`. The owner approved Roadmap #22's design
(`docs/superpowers/specs/2026-07-30-http-api-documentation-design.md`); this
change implements it.

## What Changes

- Add `docs/openapi.yaml`, a hand-written OpenAPI 3.0 document covering the
  Runtime API Layer routes a customer integration would call:
  - login
  - process create/list/versions
  - instance create/get/list/submit/claim/release/delegate/comments/cancel/record
  - the two health routes
- Each route entry documents method/path, the auth requirement (reserved
  role, if any), and the request/response schemas.
- Each route entry also documents the error statuses that route returns,
  drawn from 400, 401, 403, 409, 422, 429, 500. Each status gets a
  one-line trigger. Most routes draw this from `src/http/errors.ts`.
  `POST /auth/login` is the exception: `src/auth/login.ts` builds its own
  400/401/429 responses, bypassing `errors.ts`. `errors.ts` never maps a
  specific route to 404. A not-found instance or process returns 500 by
  design. `server.ts` keeps 404 for an unmatched path only, so no route
  entry claims it.
- No engine code changes. No new dependency, no generator: the author
  transcribes the file by hand from `src/http/routes.ts` and
  `src/http/errors.ts`.

## Capabilities

### New Capabilities
- `http-api-documentation`: a maintained OpenAPI 3.0 document describing
  the customer-facing HTTP API surface (excludes `admin/*`, `drafts/*`,
  `migration-plans/*`, `registry`, which serve `packages/admin`/`studio`
  themselves, not a customer integration).

### Modified Capabilities
(none: this change documents `http-wrapper`'s existing behavior and does
not change it)

## Impact

- New file: `docs/openapi.yaml`.
- No changes to `src/http/`, `src/runtime/`, or any package.
- No new dependency.
