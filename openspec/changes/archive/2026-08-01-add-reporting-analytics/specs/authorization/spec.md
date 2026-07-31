<!-- antislop: allow-file all -->
<!-- Every requirement in this corpus uses the same fixed SHALL/WHEN/THEN
     Gherkin grammar, established before antislop existed in this repo.
     Rewriting the prose here would touch content from many prior changes
     for a purely stylistic reason, unrelated to any change this file
     documents. -->

## MODIFIED Requirements

### Requirement: Reserved role constants gate process-admin operations

The engine SHALL define five reserved role strings in
`src/auth/authorize.ts`: `PUBLISH_ROLE = "system:publish"`, `CANCEL_ANY_ROLE =
"system:cancel-any"`, `ADMIN_ROLE = "system:admin"`, `DEVELOPER_ROLE =
"system:developer"` and `REPORTS_ROLE = "system:reports"`. These SHALL be the
only roles this capability defines; no role hierarchy, wildcard, or general
permission/policy model SHALL exist — in particular no one of them SHALL imply
any other. The `system:` prefix is a naming convention only, distinguishing
these engine-reserved roles from free-form business roles a deployment assigns
for `Step.assignment` (e.g. `"finance-approver"`) — it is not structurally
enforced, since `Actor.roles` and `auth_users.roles` remain plain `string[]`.

#### Scenario: The reserved role constants are exported

- **WHEN** `src/auth/authorize.ts` is inspected for exports
- **THEN** it exports `PUBLISH_ROLE` with value `"system:publish"`,
  `CANCEL_ANY_ROLE` with value `"system:cancel-any"`, `ADMIN_ROLE` with value
  `"system:admin"`, `DEVELOPER_ROLE` with value `"system:developer"` and
  `REPORTS_ROLE` with value `"system:reports"`

#### Scenario: The admin role implies nothing

- **WHEN** `requireRole(actor, PUBLISH_ROLE)` is called for an actor whose
  `roles` is exactly `["system:admin"]`
- **THEN** it throws `AuthorizationError`

#### Scenario: The developer role implies nothing

- **WHEN** `requireRole(actor, PUBLISH_ROLE)` or `requireRole(actor,
  ADMIN_ROLE)` is called for an actor whose `roles` is exactly
  `["system:developer"]`
- **THEN** it throws `AuthorizationError`

#### Scenario: The reports role implies nothing

- **WHEN** `requireRole(actor, PUBLISH_ROLE)`, `requireRole(actor, ADMIN_ROLE)`
  or `requireRole(actor, DEVELOPER_ROLE)` is called for an actor whose `roles`
  is exactly `["system:reports"]`
- **THEN** it throws `AuthorizationError`

#### Scenario: No other reserved role implies the reports role

- **WHEN** `requireRole(actor, REPORTS_ROLE)` is called for an actor whose
  `roles` is exactly `["system:admin"]`, exactly `["system:developer"]`,
  exactly `["system:publish"]` or exactly `["system:cancel-any"]`
- **THEN** it throws `AuthorizationError` in each case

## ADDED Requirements

### Requirement: The reports role gates every reporting route

Every route under the `/reporting/*` prefix SHALL require `REPORTS_ROLE` on
the resolved `Actor`, checked with the same direct `requireRole` call every
other role-gated route surface uses, before any query runs. An actor lacking
the role SHALL receive `403` and no result body, whether or not the requested
process exists — the check SHALL precede process resolution, so a caller
without the role cannot probe which process ids exist.

#### Scenario: An actor without the reports role is rejected

- **WHEN** an actor whose `roles` does not include `"system:reports"` calls any
  `/reporting/*` route
- **THEN** the response is `403` and carries no reporting data

#### Scenario: An actor with the reports role is admitted

- **WHEN** an actor whose `roles` includes `"system:reports"` calls a
  `/reporting/*` route for an existing process
- **THEN** the role check passes and the route returns its result

#### Scenario: The role check precedes process resolution

- **WHEN** an actor whose `roles` does not include `"system:reports"` calls a
  `/reporting/*` route naming a process id that does not exist
- **THEN** the response is `403`, not `404`

#### Scenario: The reports role grants no operator or authoring access

- **WHEN** an actor whose `roles` is exactly `["system:reports"]` calls any
  `/admin/*` route, any studio route, `publishBody`, or `cancelInstance` for an
  instance the actor did not start
- **THEN** each call is rejected with `AuthorizationError` / `403`
