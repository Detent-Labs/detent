## MODIFIED Requirements

### Requirement: OpenAPI document exists and covers the customer-facing surface

The repository SHALL contain `docs/openapi.yaml`, a valid OpenAPI 3.0
document. It SHALL describe every route a customer integration can call:
`POST /auth/login`, `POST /processes/:processId/instances`,
`GET /instances/:id`, `GET /instances`, `POST /instances/:id/submit`,
`POST /instances/:id/claim`, `POST /instances/:id/release`,
`POST /instances/:id/delegate`, `POST /instances/:id/comments`,
`GET /instances/:id/comments`, `POST /instances/:id/cancel`,
`GET /instances/:id/record`, `POST /processes`, `GET /processes`,
`GET /processes/:id/versions`, `GET /livez`, `GET /readyz`,
`GET /ui-strings`. It SHALL NOT document `admin/*`, `drafts/*`,
`migration-plans/*`, `reporting/*`, or `registry`.

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
