<!-- antislop: allow-file all -->
<!-- Every requirement in this corpus uses the same fixed SHALL/WHEN/THEN
     Gherkin grammar, established before antislop existed in this repo.
     Rewriting the prose here would touch content from many prior changes
     for a purely stylistic reason, unrelated to any change this file
     documents. -->

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
`GET /processes/:id/versions`, `GET /livez`, `GET /readyz`. It SHALL NOT
document `admin/*`, `drafts/*`, `migration-plans/*`, `reporting/*`, or
`registry`.

`reporting/*` is excluded on the same ground as `admin/*`: it is a
role-gated surface that exists to back a frontend this repository ships,
not an integration point a customer's own system calls. The exclusion is
named rather than left implicit, so a reader can tell the absence is a
decision and not an omission. Should a customer's own analytics system ever
need these numbers, documenting them is an additive change to this
requirement, not a redesign of the routes.

#### Scenario: A customer loads the document into a standard tool

- **WHEN** a customer loads `docs/openapi.yaml` into an OpenAPI-3.0-capable
  tool (Swagger UI, Postman, or a code generator)
- **THEN** the tool parses the document without error and lists every route
  named above

#### Scenario: An internal-only route is absent

- **WHEN** a reader searches `docs/openapi.yaml` for an `admin/*`,
  `drafts/*`, `migration-plans/*`, `reporting/*`, or `registry` path
- **THEN** no such path appears in the document
