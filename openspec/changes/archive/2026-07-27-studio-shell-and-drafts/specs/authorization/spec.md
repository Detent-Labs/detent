## MODIFIED Requirements

<!-- Ordering note: this delta is written against the three-role spec that
     `admin-shell-and-ops` produces, and both deltas MODIFY the same
     enumerating requirement, so the last archive wins. `admin-shell-and-ops`
     must archive BEFORE this change; archived after, its three-role block
     overwrites the merged requirement and silently drops `DEVELOPER_ROLE`.
     The code carries no such coupling — the constants are independent. -->

### Requirement: Reserved role constants gate process-admin operations

The engine SHALL define four reserved role strings in
`src/auth/authorize.ts`: `PUBLISH_ROLE = "system:publish"`, `CANCEL_ANY_ROLE =
"system:cancel-any"`, `ADMIN_ROLE = "system:admin"` and `DEVELOPER_ROLE =
"system:developer"`. These SHALL be the only roles this capability defines; no
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
  `"system:admin"` and `DEVELOPER_ROLE` with value `"system:developer"`

#### Scenario: The admin role implies nothing

- **WHEN** `requireRole(actor, PUBLISH_ROLE)` is called for an actor whose
  `roles` is exactly `["system:admin"]`
- **THEN** it throws `AuthorizationError`

#### Scenario: The developer role implies nothing

- **WHEN** `requireRole(actor, PUBLISH_ROLE)` or `requireRole(actor,
  ADMIN_ROLE)` is called for an actor whose `roles` is exactly
  `["system:developer"]`
- **THEN** it throws `AuthorizationError`

### Requirement: Authorization is checked directly at each gated operation, not through an extension point

Publishing a process body, cancelling an arbitrary instance, reading the
unfiltered instance listing, reading an instance's record, every `/admin/*`
route, and every studio route are the operations this capability gates. No
plugin envelope, registry, or configurable policy SHALL be introduced for
authorization — each gated operation calls `requireRole` directly with its
fixed role constant, the same "checked directly, not an extension point"
pattern the engine already uses for `Step.assignment.strategy.type`'s single
`"static"` check.

#### Scenario: No authorization plugin registry exists

- **WHEN** the engine's `Registry`/`DataSourceRegistry`/`AssignmentRegistry`
  extension points are inspected
- **THEN** no corresponding authorization or permission registry exists
  alongside them

#### Scenario: Each admin route calls requireRole directly

- **WHEN** `src/http/admin-routes.ts` is inspected
- **THEN** each handler calls `requireRole(actor, ADMIN_ROLE)` itself, with no
  intervening policy abstraction

#### Scenario: Each studio route calls requireRole directly

- **WHEN** `src/http/studio-routes.ts` is inspected
- **THEN** each handler calls `requireRole(actor, DEVELOPER_ROLE)` itself, with
  no intervening policy abstraction

## ADDED Requirements

### Requirement: The developer role gates the authoring surface

`DEVELOPER_ROLE` SHALL gate every studio route, starting with the four draft
routes this change introduces. It SHALL NOT grant any operation the other
reserved roles gate: publishing a process body SHALL continue to require
`system:publish` in addition, and the operator reads and `/admin/*` routes
SHALL continue to require `system:admin`.

This is additive, not a tightening: the routes it gates are new, so no
existing caller loses access. An account that needs studio is granted the role
via the existing `src/auth/cli.ts set-roles`.

#### Scenario: A developer reaches the authoring surface

- **WHEN** an actor holding `system:developer` calls a studio route
- **THEN** the request is authorized

#### Scenario: A developer does not thereby gain publish or admin rights

- **WHEN** an actor holding only `system:developer` calls `POST /processes` or
  an `/admin/*` route
- **THEN** the response is 403

#### Scenario: No existing caller is affected

- **WHEN** this change is applied
- **THEN** every route that existed beforehand requires exactly the roles it
  required beforehand
