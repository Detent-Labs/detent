## MODIFIED Requirements

### Requirement: The reports role gates every reporting route

Every route under the `/reporting/*` prefix SHALL need `REPORTS_ROLE` on the
resolved `Actor`, before any query runs. The check uses the same direct
`requireRole` call every other role-gated route surface uses.

An actor lacking the role SHALL receive `403` and no result body, whether or
not the requested process exists. The check SHALL precede process
resolution. A caller without the role therefore cannot probe which process
ids exist.

The three process-scoped aggregate views SHALL need a second, independent
check. Each of `handleReportingCycleTime`, `handleReportingBottleneck` and
`handleReportingSla` SHALL await `requirePermission(actor, "read",
processId, db)`. This second check SHALL run after the `REPORTS_ROLE` check
passes. `REPORTS_ROLE` alone SHALL NOT satisfy the `read` check. A `read`
grant or `ADMIN_ROLE` alone SHALL NOT satisfy the `REPORTS_ROLE` check.
Neither check SHALL imply the other.

The other nine `/reporting/*` routes SHALL keep exactly the gate each has
today. The process listing names no process. Neither do the five
saved-report CRUD routes. Both therefore need no `read` check.
`handleExecuteReport`, `handlePreviewReport` and
`handleReportColumnChoices` already check `read` themselves, inside the
Runtime API Layer.

This is a **BREAKING** tightening of the three aggregate routes. An actor
holding `REPORTS_ROLE` alone, with no `read` grant and no `ADMIN_ROLE`,
loses the read access it had. An operator restores it with a `read` grant
scoped to the process, or with `ADMIN_ROLE`.

<!-- Title copies the live spec's existing scenario name verbatim; archive sync needs it unchanged. -->
<!-- antislop: allow passive-voice -->
#### Scenario: An actor without the reports role is rejected

- **WHEN** an actor whose `roles` does not include `"system:reports"` calls
  any `/reporting/*` route
- **THEN** the response is `403` and carries no reporting data

<!-- Title copies the live spec's existing scenario name verbatim; the body now names a non-aggregate route, the one this scenario still holds for. -->
<!-- antislop: allow passive-voice -->
#### Scenario: An actor with the reports role is admitted

- **WHEN** an actor whose `roles` includes `"system:reports"` calls `GET
  /reporting/processes`
- **THEN** the role check passes, and the route returns its result

#### Scenario: The role check precedes process resolution

- **WHEN** an actor whose `roles` does not include `"system:reports"` calls a
  `/reporting/*` route naming a process id that does not exist
- **THEN** the response is `403`, not `404`

#### Scenario: The reports role grants no operator or authoring access

- **WHEN** an actor whose `roles` is exactly `["system:reports"]` calls any
  `/admin/*` route or any studio route
- **THEN** the engine rejects the call with `AuthorizationError` / `403`

#### Scenario: The reports role does not bypass instance ownership

- **WHEN** an actor whose `roles` is exactly `["system:reports"]` calls
  `publishBody`, or calls `cancelInstance` for an instance they did not
  start
- **THEN** the engine rejects the call with `AuthorizationError` / `403`

#### Scenario: The reports role alone does not admit an aggregate view

- **WHEN** an actor whose `roles` is exactly `["system:reports"]` calls one
  of the three aggregate routes
- **AND** the store holds no `read` grant matching that actor's roles over
  the requested process
- **THEN** the response is `403`

#### Scenario: An admin reaches every aggregate view through the reports role

- **WHEN** an actor whose `roles` includes both `"system:reports"` and
  `"system:admin"` calls one of the three aggregate routes for an existing
  process
- **THEN** the role check and the `read` check both pass
- **AND** the route returns its result

#### Scenario: A read grant admits the aggregate view alongside the reports role

- **WHEN** an actor holds `"system:reports"` and, through a stored grant,
  `read` over the requested process
- **AND** that actor holds no other reserved role
- **THEN** the aggregate route returns its result

#### Scenario: The read check does not reach the non-aggregate reporting routes

- **WHEN** an actor whose `roles` is exactly `["system:reports"]`, holding no
  `read` grant over any process, calls `GET /reporting/processes` or `GET
  /reporting/reports`
- **THEN** each route returns its result
- **AND** neither route evaluates the `read` permission
