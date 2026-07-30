## ADDED Requirements

### Requirement: OpenAPI document exists and covers the customer-facing surface

The repository SHALL contain `docs/openapi.yaml`, a valid OpenAPI 3.0
document. It SHALL describe every route a customer integration can call:
`POST /auth/login`, `POST /processes/:processId/instances`,
`GET /instances/:id`, `GET /instances`, `POST /instances/:id/submit`,
`POST /instances/:id/claim`, `POST /instances/:id/release`,
`POST /instances/:id/delegate`, `POST /instances/:id/comments`,
`GET /instances/:id/comments`, `POST /instances/:id/cancel`,
`GET /instances/:id/record`, `POST /processes`, `GET /processes`,
`GET /processes/:id/versions`, `GET /livez`, `GET /readyz`. It SHALL NOT
document `admin/*`, `drafts/*`, `migration-plans/*`, or `registry`.

#### Scenario: A customer loads the document into a standard tool

- **WHEN** a customer loads `docs/openapi.yaml` into an OpenAPI-3.0-capable
  tool (Swagger UI, Postman, or a code generator)
- **THEN** the tool parses the document without error and lists every route
  named above

#### Scenario: An internal-only route is absent

- **WHEN** a reader searches `docs/openapi.yaml` for an `admin/*`,
  `drafts/*`, `migration-plans/*`, or `registry` path
- **THEN** no such path appears in the document

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
