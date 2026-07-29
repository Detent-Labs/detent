# authorization Specification

## Purpose

Gates the process-admin, operator-facing, and studio HTTP operations that
carry no permission check of their own behind a reserved role on the
already-resolved `Actor`: publishing a process definition, cancelling an
arbitrary instance, the unfiltered instance listing, an instance's merged
record, every `/admin/*` route, and every studio route. Cancelling one's
*own* instance is a separate, narrower path this capability does not gate —
see "An instance's starter may cancel it without the reserved role" below.
Built on top of `actor-resolution`/`jwt-authentication`/`local-user-accounts`:
those capabilities establish *who* the caller is; this one decides whether
that identity may perform an administrative, operator-facing, or authoring
operation. Deliberately minimal — four fixed role strings, checked directly
at each call site that needs one, with no policy engine, role hierarchy, or
pluggable extension point. See the `http-wrapper` capability for how the
resulting `403` surfaces over HTTP.

## Requirements

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

### Requirement: Authorization is orthogonal to assignment/claim enforcement

Where a step declares an `assignment`, `submitAndTransition`, `claimStep`, and
`releaseClaim` SHALL remain gated exclusively by the existing assignment/claim
mechanism (`NotAssignedError`, `NotACandidateError`, `AlreadyClaimedError`,
`NotClaimedError`, `NotClaimantError`), unrelated to `system:publish` /
`system:cancel-any`. An actor may hold neither reserved role and still fully
participate in process instances it is assigned to. (The one exception is the
starter-or-operator floor `submitAndTransition` applies to a step that declares
**no** assignment, where the assignment/claim mechanism defines no relationship
to enforce — see the `runtime-api` capability.)

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
running instance. This bypass SHALL be `cancelInstance`-specific, not a
reserved role of its own or a general "owner" permission model: it SHALL NOT
extend to publish, and SHALL NOT let a starter cancel an instance they did not
start.

#### Scenario: A starter without the reserved role cancels their own instance

- **WHEN** an actor who lacks `system:cancel-any`, but whose id matches the
  instance's `startedBy`, calls `cancelInstance`
- **THEN** the cancellation succeeds

#### Scenario: A non-starter without the reserved role is still rejected

- **WHEN** an actor who lacks `system:cancel-any` and did not start the
  instance calls `cancelInstance`
- **THEN** it throws `AuthorizationError`

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

### Requirement: Reading one instance is authorized by relationship to it

`getInstanceView` SHALL authorize the caller against the instance before
returning it. An actor MAY read an instance when at least one of the following
holds, evaluated against the instance's currently committed state:

- the actor carries `ADMIN_ROLE`;
- `instance.startedBy` equals the actor's id;
- the current step's assignment is claimed by the actor
  (`instance.assignment.claimedBy === actor.id`);
- the actor is an eligible candidate on the current step's assignment, decided
  by the same `isEligibleCandidate` predicate `claimStep` uses — id or role
  match against one flat candidate namespace.

An actor satisfying none of them SHALL be rejected with `AuthorizationError`
(403, `type: "authorization"`), and the instance SHALL NOT be read out to
them in any form.

The relationship is evaluated against the **current** step, not the
instance's history: an actor who was a candidate on an earlier step, never
claimed it, and holds no other relationship loses the read when the instance
advances. This mirrors `scope=mine`, which stops listing the instance at the
same moment for the same reason.

The check SHALL live in the runtime API (`getInstanceView`), not in the HTTP
route handler, so an in-process caller of the documented library seam cannot
bypass it — the placement `cancelInstance` already uses.

This is a **BREAKING** tightening of a route that previously required only a
valid token. An integration account that reads instances it has no
relationship to must be granted `system:admin` via `src/auth/cli.ts
set-roles`.

#### Scenario: The instance's starter reads it

- **WHEN** the actor that created an instance requests `GET /instances/:id`
- **THEN** the response is 200 and carries the resolved view

#### Scenario: The current claimant reads it

- **WHEN** the actor holding the current step's claim requests the view, and
  did not start the instance
- **THEN** the response is 200

#### Scenario: A candidate on the current step reads it

- **WHEN** an actor eligible by id or by role on the current step's
  unclaimed assignment requests the view, and holds no other relationship
- **THEN** the response is 200

#### Scenario: An unrelated authenticated actor is refused

- **WHEN** an authenticated actor holding no reserved role, who did not start
  the instance, does not hold its claim, and is not a candidate on its
  current step, requests the view with a valid instance id
- **THEN** the response is 403 with `error.type` `authorization`, and no
  field value from `instance.data` appears in the response

#### Scenario: A past candidate loses the read when the instance moves on

- **WHEN** an actor was an eligible candidate on the step an instance has
  since left, never claimed it, did not start it, and is not a candidate on
  the current step
- **THEN** the response is 403

#### Scenario: An operator reads any instance

- **WHEN** an actor holding `system:admin` requests the view for an instance
  they have no other relationship to
- **THEN** the response is 200, consistent with the same role's access to
  `scope=all` and to the record route

#### Scenario: A refusal discloses nothing about existence

- **WHEN** an actor with no relationship and no `system:admin` requests the
  view for an instance id that does not exist
- **THEN** the response is the same 403 `authorization` an existing but
  unrelated instance produces — the two cases are indistinguishable to the
  caller

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
