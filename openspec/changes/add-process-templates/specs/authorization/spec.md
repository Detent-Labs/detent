## MODIFIED Requirements

<!-- The block below reproduces the wording of the requirement it replaces,
     which archive needs in full. Rewriting the carried-over prose would lose
     the match against openspec/specs/authorization/spec.md. Only the count,
     the seventh constant and its two new scenarios change. The directives
     below excuse that carried-over wording, nothing this change wrote. -->

### Requirement: Reserved role constants gate process-admin operations

<!-- antislop: allow em-dash sentence-length run-ons passive-voice frozen-verbs -->

The engine SHALL define seven reserved role strings in
`src/auth/authorize.ts`. They are `PUBLISH_ROLE = "system:publish"`,
`CANCEL_ANY_ROLE = "system:cancel-any"`, `ADMIN_ROLE = "system:admin"`,
`DEVELOPER_ROLE = "system:developer"`, `REPORTS_ROLE = "system:reports"`,
`DATALISTS_ROLE = "system:datalists"` and
`TEMPLATES_ROLE = "system:templates"`. These SHALL be
the only roles this capability defines; no role hierarchy, wildcard, or general
permission/policy model SHALL exist — in particular no one of them SHALL imply
any other. The `system:` prefix is a naming convention only, distinguishing
these engine-reserved roles from free-form business roles a deployment assigns
for `Step.assignment` (e.g. `"finance-approver"`) — it is not structurally
enforced, since `Actor.roles` and `auth_users.roles` remain plain `string[]`.

<!-- antislop: allow passive-voice -->

#### Scenario: The reserved role constants are exported

<!-- antislop: allow passive-voice sentence-length run-ons -->

- **WHEN** `src/auth/authorize.ts` is inspected for exports
- **THEN** it exports `PUBLISH_ROLE` with value `"system:publish"`,
  `CANCEL_ANY_ROLE` with value `"system:cancel-any"`, `ADMIN_ROLE` with value
  `"system:admin"`, `DEVELOPER_ROLE` with value `"system:developer"`,
  `REPORTS_ROLE` with value `"system:reports"`, `DATALISTS_ROLE` with value
  `"system:datalists"` and `TEMPLATES_ROLE` with value `"system:templates"`

#### Scenario: The admin role implies nothing

<!-- antislop: allow passive-voice -->

- **WHEN** `requireRole(actor, PUBLISH_ROLE)` is called for an actor whose
  `roles` is exactly `["system:admin"]`
- **THEN** it throws `AuthorizationError`

#### Scenario: The developer role implies nothing

<!-- antislop: allow passive-voice -->

- **WHEN** `requireRole(actor, PUBLISH_ROLE)` or `requireRole(actor,
  ADMIN_ROLE)` is called for an actor whose `roles` is exactly
  `["system:developer"]`
- **THEN** it throws `AuthorizationError`

#### Scenario: The reports role implies nothing

<!-- antislop: allow passive-voice -->

- **WHEN** `requireRole(actor, PUBLISH_ROLE)`, `requireRole(actor, ADMIN_ROLE)`
  or `requireRole(actor, DEVELOPER_ROLE)` is called for an actor whose `roles`
  is exactly `["system:reports"]`
- **THEN** it throws `AuthorizationError`

#### Scenario: No other reserved role implies the reports role

<!-- antislop: allow passive-voice -->

- **WHEN** `requireRole(actor, REPORTS_ROLE)` is called for an actor whose
  `roles` is exactly `["system:admin"]`, exactly `["system:developer"]`,
  exactly `["system:publish"]` or exactly `["system:cancel-any"]`
- **THEN** it throws `AuthorizationError` in each case

#### Scenario: The data list role implies nothing

<!-- antislop: allow passive-voice -->

- **WHEN** `requireRole(actor, ADMIN_ROLE)`, `requireRole(actor,
  DEVELOPER_ROLE)` or `requireRole(actor, CANCEL_ANY_ROLE)` is called for an
  actor whose `roles` is exactly `["system:datalists"]`
- **THEN** it throws `AuthorizationError` in each case

#### Scenario: No other reserved role implies the data list role

<!-- antislop: allow passive-voice -->

- **WHEN** `requireRole(actor, DATALISTS_ROLE)` is called for an actor whose
  `roles` is exactly `["system:admin"]` or exactly `["system:developer"]`
- **THEN** it throws `AuthorizationError` in both cases

#### Scenario: The template role implies nothing

<!-- antislop: allow passive-voice -->

- **WHEN** an actor whose `roles` is exactly `["system:templates"]` reaches
  `requireRole(actor, ADMIN_ROLE)`, `requireRole(actor, DEVELOPER_ROLE)` or
  `requireRole(actor, PUBLISH_ROLE)`
- **THEN** it throws `AuthorizationError` in each case

#### Scenario: No other reserved role implies the template role

<!-- antislop: allow passive-voice -->

- **WHEN** an actor whose `roles` is exactly `["system:admin"]`, exactly
  `["system:developer"]` or exactly `["system:datalists"]` reaches
  `requireRole(actor, TEMPLATES_ROLE)`
- **THEN** it throws `AuthorizationError` in each case

## ADDED Requirements

### Requirement: A system:templates role gates template maintenance

`system:templates` SHALL gate both template write routes, `PUT /templates/:key`
and `DELETE /templates/:key`. It SHALL admit both template read routes, `GET
/templates` and `GET /templates/:key`, together with `system:developer`. The
second role reads a template so that every author can seed a process from one.

The narrow grant is the point. Staff who curate a template must not gain the
power to publish a process. They must not gain the power to cancel an instance
or to administer an account.

`system:templates` SHALL also admit `GET
/processes/:processId/versions/:version`, the published body a curator creates
a template from, together with `system:developer`. It SHALL NOT admit any
draft route. A draft holds unfinished, private work. A published body is the one
every participant already runs.

The role mirrors `system:datalists`, including the read asymmetry. It implies
nothing, and no other reserved role implies it.

#### Scenario: The role gates a template write
- **WHEN** an actor holding `system:templates` writes a template
- **THEN** the route accepts the write

#### Scenario: A developer does not inherit template write access
- **WHEN** an actor holding only `system:developer` writes a template
- **THEN** the route answers with an authorization error

#### Scenario: An admin does not inherit template write access
- **WHEN** an actor holding only `system:admin` deletes a template
- **THEN** the route answers with an authorization error

#### Scenario: A developer reads the template list
- **WHEN** an actor holding only `system:developer` calls `GET /templates`
- **THEN** the route returns the list

#### Scenario: A curator reads one template
- **WHEN** an actor holding only `system:templates` calls `GET /templates/:key`
- **THEN** the route returns that template

#### Scenario: The role opens no other route surface
- **WHEN** an actor whose `roles` is exactly `["system:templates"]` calls `POST
  /processes`, any `/admin/*` route, or any `/reporting/*` route
- **THEN** the response is `403` in each case

#### Scenario: The role reads a published version's body
- **WHEN** an actor holding only `system:templates` calls `GET
  /processes/:processId/versions/:version`
- **THEN** the route returns the body

#### Scenario: The role opens no other studio route
- **WHEN** that same actor calls a studio route outside the four template
  routes and the published version body
- **THEN** the response is `403`
