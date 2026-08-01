## MODIFIED Requirements

<!-- antislop: allow-file passive-voice sentence-length run-ons frozen-verbs em-dash -->
<!-- The block below reproduces the wording of the requirement it replaces,
     which archive needs in full. Rewriting the carried-over prose would lose
     the match against openspec/specs/authorization/spec.md. Only the count,
     the sixth constant and its two scenarios change. -->

### Requirement: Reserved role constants gate process-admin operations

The engine SHALL define six reserved role strings in
`src/auth/authorize.ts`: `PUBLISH_ROLE = "system:publish"`, `CANCEL_ANY_ROLE =
"system:cancel-any"`, `ADMIN_ROLE = "system:admin"`, `DEVELOPER_ROLE =
"system:developer"`, `REPORTS_ROLE = "system:reports"` and `DATALISTS_ROLE =
"system:datalists"`. These SHALL be the only roles this capability defines; no
role hierarchy, wildcard, or general permission/policy model SHALL exist — in
particular no one of them SHALL imply any other. The `system:` prefix is a
naming convention only, distinguishing these engine-reserved roles from
free-form business roles a deployment assigns for `Step.assignment` (e.g.
`"finance-approver"`) — it is not structurally enforced, since `Actor.roles`
and `auth_users.roles` remain plain `string[]`.

#### Scenario: The reserved role constants are exported

- **WHEN** `src/auth/authorize.ts` is inspected for exports
- **THEN** it exports `PUBLISH_ROLE` with value `"system:publish"`,
  `CANCEL_ANY_ROLE` with value `"system:cancel-any"`, `ADMIN_ROLE` with value
  `"system:admin"`, `DEVELOPER_ROLE` with value `"system:developer"`,
  `REPORTS_ROLE` with value `"system:reports"` and `DATALISTS_ROLE` with value
  `"system:datalists"`

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

#### Scenario: The data list role implies nothing

- **WHEN** `requireRole(actor, ADMIN_ROLE)`, `requireRole(actor,
  DEVELOPER_ROLE)` or `requireRole(actor, CANCEL_ANY_ROLE)` is called for an
  actor whose `roles` is exactly `["system:datalists"]`
- **THEN** it throws `AuthorizationError` in each case

#### Scenario: No other reserved role implies the data list role

- **WHEN** `requireRole(actor, DATALISTS_ROLE)` is called for an actor whose
  `roles` is exactly `["system:admin"]` or exactly `["system:developer"]`
- **THEN** it throws `AuthorizationError` in both cases

## ADDED Requirements

### Requirement: A system:datalists role gates data list maintenance

`system:datalists` SHALL gate every data list write route. It SHALL admit the
data list reads together with `system:developer`, the second so the studio can
offer the existing keys as a choice.

The narrow grant is the point. Staff who maintain value lists must not gain
the power to cancel instances or to publish a process.

#### Scenario: The role gates a data list write
- **WHEN** an actor holding `system:datalists` writes a data list
- **THEN** the route accepts it

#### Scenario: An admin does not inherit data list write access
- **WHEN** an actor holding only `system:admin` writes a data list
- **THEN** the route answers with an authorization error
