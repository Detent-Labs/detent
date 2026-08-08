# http-api-documentation Specification

## Purpose

The engine's REST/JSON wrapper (`src/http/`) has grown a customer-facing
surface. It covers auth, process instances, comments, claims and delegation,
process listing, and health checks. No machine-readable description of it
exists.

A customer integration had no single source for which routes exist and what
auth they need. It also had no source for what each route accepts and
returns, or which error statuses to expect.

This spec is the contract for `docs/openapi.yaml`, a valid OpenAPI 3.0
document. It covers exactly the customer-facing routes and none of the
internal-only ones (`admin/*`, `drafts/*`, `migration-plans/*`, `registry`).
No engine code changes. This is documentation of the existing HTTP surface.
## Requirements
### Requirement: OpenAPI document exists and covers the customer-facing surface

The repository SHALL contain `docs/openapi.yaml`, a valid OpenAPI 3.0
document. It SHALL describe every route a customer integration can call:
`POST /auth/login`, `POST /processes/:processId/instances`,
`GET /instances/:id`, `GET /instances`, `POST /instances/:id/submit`,
`POST /instances/:id/claim`, `POST /instances/:id/release`,
`POST /instances/:id/delegate`, `POST /instances/:id/comments`,
`GET /instances/:id/comments`, `POST /instances/:id/cancel`,
`GET /instances/:id/record`, `POST /processes`, `GET /processes`,
`GET /processes/:id/versions`, `GET /account/me`, `PATCH /account/me`,
`GET /livez`, `GET /readyz`, `GET /ui-strings`. It SHALL NOT document
`admin/*`, `drafts/*`, `migration-plans/*`, `reporting/*`, or `registry`.

`reporting/*` falls under the same ground as `admin/*`. It is a role-gated
surface backing a frontend this repository ships. It is not an integration
point a customer's own system calls.

`GET /ui-strings` falls under the opposite ground. It backs a frontend
this repository ships, as `registry` does. No token and no role gate it.
A document that omits a route in that state reads as an oversight rather
than a decision. It therefore joins the document, beside the two health
routes. No token gates those two either, for the same reason.
`GET /admin/ui-strings` and `PUT /admin/ui-strings` stay outside the
document, under the `admin/*` exclusion.

`GET` and `PATCH /account/me` join the document too. A token reaches them
and no role gates them, so any integration holding a session can call them.
They scope to the caller's own account, which is what keeps them outside the
`admin/*` exclusion: they administer nobody.

This requirement names the exclusion rather than leaving it implicit. A
reader can then tell the absence is a decision, not an omission. Should a
customer's own analytics system ever need these numbers, documenting them
extends this requirement. It does not redesign the routes.

#### Scenario: A customer loads the document into a standard tool

- **WHEN** a customer loads `docs/openapi.yaml` into an OpenAPI-3.0-capable
  tool (Swagger UI, Postman, or a code generator)
- **THEN** the tool parses the document without error and lists every route
  named above

#### Scenario: An internal-only route is absent

- **WHEN** a reader searches `docs/openapi.yaml` for an `admin/*`,
  `drafts/*`, `migration-plans/*`, `reporting/*`, or `registry` path
- **THEN** no such path appears in the document

#### Scenario: The public override read declares that it needs no auth

- **WHEN** a reader looks up `GET /ui-strings` in `docs/openapi.yaml`
- **THEN** the entry states that the route needs no role and no token

#### Scenario: The self-scoped account routes appear

- **WHEN** a reader searches `docs/openapi.yaml` for `/account/me`
- **THEN** both `GET` and `PATCH` appear, each stating that it needs a token
  and no role

### Requirement: Each route documents auth, schema, and errors

Each documented route SHALL state its auth requirement: a reserved role
from `authorization`, or none. Each route SHALL state its request body
schema and its response schema. Each route SHALL list the error statuses
it returns, drawn from 400, 401, 403, 409, 422, 429, 500, each with a
one-line trigger.

`POST /auth/login` draws its statuses from `src/auth/login.ts`, which
builds its own responses and bypasses `src/http/errors.ts`. Every other
route draws its statuses from `src/http/errors.ts`. No route entry SHALL
claim 404. `src/http/errors.ts` never maps a specific route to that
status. A not-found instance or process returns 500 by design.

#### Scenario: A reader checks the auth requirement for an admin-role route

- **WHEN** a reader looks up `POST /processes` in `docs/openapi.yaml`
- **THEN** the entry states the `system:publish` role requirement, matching
  `authorization`'s existing gate on that route

#### Scenario: A reader checks an error trigger

- **WHEN** a reader looks up the 409 status on `POST /instances/:id/submit`
- **THEN** the entry gives a one-line trigger consistent with the
  `runtime-api` concurrency-conflict behavior that route already has

#### Scenario: A reader checks whether any route claims 404

- **WHEN** a reader searches every route entry in `docs/openapi.yaml` for
  a documented 404 response
- **THEN** no route entry lists 404, matching `src/http/errors.ts`'s
  mapping

#### Scenario: A reader checks the login route's rate limit

- **WHEN** a reader looks up the 429 status on `POST /auth/login`
- **THEN** the entry gives a one-line trigger matching
  `checkAndRecordAttempt`'s per-email rate limit in `src/auth/login.ts`,
  and no other documented route lists 429
