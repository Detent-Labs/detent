# authorization Specification

## Purpose

Gates the two process-admin HTTP operations that carry no permission check
today — publishing a process definition and cancelling an arbitrary
instance — behind a reserved role on the already-resolved `Actor`. Cancelling
one's *own* instance is a separate, narrower path this capability does not
gate — see "An instance's starter may cancel it without the reserved role"
below. Built on
top of `actor-resolution`/`jwt-authentication`/`local-user-accounts`: those
capabilities establish *who* the caller is; this one decides whether that
identity may perform an administrative operation. Deliberately minimal — two
fixed role strings, checked directly at the two call sites that need them,
with no policy engine, role hierarchy, or pluggable extension point. See the
`http-wrapper` capability for how the resulting `403` surfaces over HTTP.

## Requirements

### Requirement: Reserved role constants gate process-admin operations

The engine SHALL define two reserved role strings in `src/auth/authorize.ts`:
`PUBLISH_ROLE = "system:publish"` and `CANCEL_ANY_ROLE =
"system:cancel-any"`. These SHALL be the only roles this capability defines;
no role hierarchy, wildcard, or general permission/policy model SHALL exist.
The `system:` prefix is a naming convention only, distinguishing these two
engine-reserved roles from free-form business roles a deployment assigns for
`Step.assignment` (e.g. `"finance-approver"`) — it is not structurally
enforced, since `Actor.roles` and `auth_users.roles` remain plain
`string[]`.

#### Scenario: The reserved role constants are exported

- **WHEN** `src/auth/authorize.ts` is inspected for exports
- **THEN** it exports `PUBLISH_ROLE` with value `"system:publish"` and
  `CANCEL_ANY_ROLE` with value `"system:cancel-any"`

### Requirement: requireRole throws a distinct error when the actor lacks the role

The engine SHALL expose `requireRole(actor: Actor, role: string): void` in
`src/auth/authorize.ts`. It SHALL throw `AuthorizationError` when `role` is
not present in `actor.roles`, and SHALL return without effect when it is
present. `AuthorizationError` SHALL be a distinct `Error` subclass, never
reused for or conflated with `ActorResolutionError` (which signals "no valid
identity" rather than "valid identity, insufficient permission").

#### Scenario: An actor carrying the required role passes

- **WHEN** `requireRole(actor, PUBLISH_ROLE)` is called for an actor whose
  `roles` includes `"system:publish"`
- **THEN** it returns without throwing

#### Scenario: An actor missing the required role is rejected

- **WHEN** `requireRole(actor, PUBLISH_ROLE)` is called for an actor whose
  `roles` does not include `"system:publish"`
- **THEN** it throws `AuthorizationError`

#### Scenario: An actor with no roles at all is rejected

- **WHEN** `requireRole(actor, CANCEL_ANY_ROLE)` is called for an actor
  whose `roles` is an empty array
- **THEN** it throws `AuthorizationError`

### Requirement: Authorization is checked directly at the two gated operations, not through an extension point

Publishing a process body and cancelling an arbitrary instance are the only
two operations this capability gates. No plugin envelope, registry, or
configurable policy SHALL be introduced for authorization — each gated
operation calls `requireRole` directly with its fixed role constant, the
same "checked directly, not an extension point" pattern the engine already
uses for `Step.assignment.strategy.type`'s single `"static"` check.

#### Scenario: No authorization plugin registry exists

- **WHEN** the engine's `Registry`/`DataSourceRegistry`/`AssignmentRegistry`
  extension points are inspected
- **THEN** no corresponding authorization or permission registry exists
  alongside them

### Requirement: Authorization is orthogonal to assignment/claim enforcement

This capability SHALL NOT alter `submitAndTransition`, `claimStep`, or
`releaseClaim` — those remain gated exclusively by the existing
assignment/claim mechanism (`NotAssignedError`, `NotACandidateError`,
`AlreadyClaimedError`, `NotClaimedError`, `NotClaimantError`), unrelated to
`system:publish` / `system:cancel-any`. An actor may hold neither reserved
role and still fully participate in process instances it is assigned to.

#### Scenario: An actor with no reserved roles can still submit an assigned step

- **WHEN** an actor whose `roles` includes neither `system:publish` nor
  `system:cancel-any`, but who is a claimed candidate on the instance's
  current step, submits data via `submitAndTransition`
- **THEN** the submission is processed normally, unaffected by this
  capability

### Requirement: An instance's starter may cancel it without the reserved role

`cancelInstance` (`src/runtime/api.ts`) SHALL first attempt `requireRole(actor,
CANCEL_ANY_ROLE)`; when that throws `AuthorizationError`, `cancelInstance`
SHALL NOT propagate the rejection. It SHALL instead load the instance and
SHALL permit the cancellation when `instance.startedBy === actor.id` — an
actor who started an instance may cancel it without holding
`system:cancel-any`, so an abandoned start doesn't strand an unassigned
running instance. This bypass SHALL be `cancelInstance`-specific, not a third
reserved role or a general "owner" permission model: it SHALL NOT extend to
publish, and SHALL NOT let a starter cancel an instance they did not start.

#### Scenario: A starter without the reserved role cancels their own instance

- **WHEN** an actor who lacks `system:cancel-any`, but whose id matches the
  instance's `startedBy`, calls `cancelInstance`
- **THEN** the cancellation succeeds

#### Scenario: A non-starter without the reserved role is still rejected

- **WHEN** an actor who lacks `system:cancel-any` and did not start the
  instance calls `cancelInstance`
- **THEN** it throws `AuthorizationError`
