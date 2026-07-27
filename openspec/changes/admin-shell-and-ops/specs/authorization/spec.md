## MODIFIED Requirements

### Requirement: Reserved role constants gate process-admin operations

The engine SHALL define three reserved role strings in
`src/auth/authorize.ts`: `PUBLISH_ROLE = "system:publish"`, `CANCEL_ANY_ROLE =
"system:cancel-any"` and `ADMIN_ROLE = "system:admin"`. These SHALL be the only
roles this capability defines; no role hierarchy, wildcard, or general
permission/policy model SHALL exist — in particular `system:admin` SHALL NOT
imply either of the other two. The `system:` prefix is a naming convention
only, distinguishing these engine-reserved roles from free-form business roles
a deployment assigns for `Step.assignment` (e.g. `"finance-approver"`) — it is
not structurally enforced, since `Actor.roles` and `auth_users.roles` remain
plain `string[]`.

#### Scenario: The reserved role constants are exported

- **WHEN** `src/auth/authorize.ts` is inspected for exports
- **THEN** it exports `PUBLISH_ROLE` with value `"system:publish"`,
  `CANCEL_ANY_ROLE` with value `"system:cancel-any"` and `ADMIN_ROLE` with
  value `"system:admin"`

#### Scenario: The admin role implies nothing

- **WHEN** `requireRole(actor, PUBLISH_ROLE)` is called for an actor whose
  `roles` is exactly `["system:admin"]`
- **THEN** it throws `AuthorizationError`

### Requirement: Authorization is checked directly at each gated operation, not through an extension point

Publishing a process body, cancelling an arbitrary instance, reading the
unfiltered instance listing, reading an instance's record, and every `/admin/*`
route are the operations this capability gates. No plugin envelope, registry,
or configurable policy SHALL be introduced for authorization — each gated
operation calls `requireRole` directly with its fixed role constant, the same
"checked directly, not an extension point" pattern the engine already uses for
`Step.assignment.strategy.type`'s single `"static"` check.

#### Scenario: No authorization plugin registry exists

- **WHEN** the engine's `Registry`/`DataSourceRegistry`/`AssignmentRegistry`
  extension points are inspected
- **THEN** no corresponding authorization or permission registry exists
  alongside them

#### Scenario: Each admin route calls requireRole directly

- **WHEN** `src/http/admin-routes.ts` is inspected
- **THEN** each handler calls `requireRole(actor, ADMIN_ROLE)` itself, with no
  intervening policy abstraction

## RENAMED Requirements

- FROM: `### Requirement: Authorization is checked directly at the two gated operations, not through an extension point`
- TO: `### Requirement: Authorization is checked directly at each gated operation, not through an extension point`

## ADDED Requirements

### Requirement: The operator role gates the operator-facing reads and routes

`ADMIN_ROLE` SHALL gate every `/admin/*` route and, additionally, the two
existing reads that today carry no permission check at all: the unfiltered
instance listing (`GET /instances` with `scope=all` or with `scope` omitted)
and `GET /instances/:instanceId/record`. `scope=mine` SHALL remain open to
every authenticated actor, so an actor holding no reserved role still fully
participates in the instances it is a candidate for.

This is a **BREAKING** tightening: an account that relied on either read
without holding `system:admin` must be granted the role via the existing
`src/auth/cli.ts set-roles`.

#### Scenario: A participant can still see their own work

- **WHEN** an actor holding no reserved role requests `GET /instances?scope=mine`
- **THEN** the response is 200 and carries their assignments

#### Scenario: The same participant cannot see everything

- **WHEN** that actor requests `GET /instances?scope=all` or `GET /instances`
  with no `scope`
- **THEN** the response is 403

#### Scenario: The same participant cannot read a record

- **WHEN** that actor requests `GET /instances/:id/record`, including for an
  instance they started
- **THEN** the response is 403
