# authorization Specification

## Purpose

Gates the process-admin, operator-facing, and studio HTTP operations that
carry no permission check of their own behind a reserved role on the
already-resolved `Actor`: publishing a process definition, cancelling an
arbitrary instance, the unfiltered instance listing, an instance's merged
record, every `/admin/*` route, and every studio route. Cancelling one's
*own* instance, and a developer reading the record of an instance they
started through Studio's Player, are each a separate, narrower path this
capability does not gate — see "An instance's starter may cancel it without
the reserved role" and "A developer may read the record of an instance they
started, without the reserved role" below.
Built on top of `actor-resolution`/`jwt-authentication`/`local-user-accounts`:
those capabilities establish *who* the caller is; this one decides whether
that identity may perform an administrative, operator-facing, or authoring
operation. Deliberately minimal — five fixed role strings, checked directly
at each call site that needs one, with no policy engine, role hierarchy, or
pluggable extension point. See the `http-wrapper` capability for how the
resulting `403` surfaces over HTTP.

## Requirements

### Requirement: Reserved role constants gate process-admin operations

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

#### Scenario: The reserved role constants are exported

- **WHEN** `src/auth/authorize.ts` is inspected for exports
- **THEN** it exports `PUBLISH_ROLE` with value `"system:publish"`,
  `CANCEL_ANY_ROLE` with value `"system:cancel-any"`, `ADMIN_ROLE` with value
  `"system:admin"`, `DEVELOPER_ROLE` with value `"system:developer"`,
  `REPORTS_ROLE` with value `"system:reports"`, `DATALISTS_ROLE` with value
  `"system:datalists"` and `TEMPLATES_ROLE` with value `"system:templates"`

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

#### Scenario: The template role implies nothing

- **WHEN** an actor whose `roles` is exactly `["system:templates"]` reaches
  `requireRole(actor, ADMIN_ROLE)`, `requireRole(actor, DEVELOPER_ROLE)` or
  `requireRole(actor, PUBLISH_ROLE)`
- **THEN** it throws `AuthorizationError` in each case

#### Scenario: No other reserved role implies the template role

- **WHEN** an actor whose `roles` is exactly `["system:admin"]`, exactly
  `["system:developer"]` or exactly `["system:datalists"]` reaches
  `requireRole(actor, TEMPLATES_ROLE)`
- **THEN** it throws `AuthorizationError` in each case

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

### Requirement: A developer may read the record of an instance they started, without the reserved role

`getInstanceRecord` (`src/runtime/api.ts`) SHALL first attempt
`requireRole(actor, ADMIN_ROLE)`; when that throws `AuthorizationError`,
`getInstanceRecord` SHALL NOT propagate the rejection. It SHALL instead load
the instance and SHALL permit the read when both `actor.roles` includes
`DEVELOPER_ROLE` and `instance.startedBy === actor.id` — a developer reading
the record of an instance created through their own Studio Player session,
without holding `system:admin`. This bypass SHALL be `getInstanceRecord`-
specific, mirroring `cancelInstance`'s existing starter bypass for
`system:cancel-any`: it SHALL NOT extend to any other operator-facing read
or route, and SHALL NOT let a developer read the record of an instance they
did not start.

A caller satisfying neither `ADMIN_ROLE` nor the developer-and-starter pair
SHALL learn nothing about the target instance from a failed attempt: an
unresolvable instance id and a resolvable instance that is neither theirs
nor readable by role SHALL both collapse to the same `AuthorizationError`,
preserving the existing "a role-less caller is rejected before any instance
state becomes observable to it" guarantee this capability already holds for
`cancelInstance`.

The requirement above gating `GET /instances/:id/record` behind
`system:admin` is untouched by this addition: an actor holding neither
`system:admin` nor `system:developer` still gets `AuthorizationError`, even
for an instance they themselves started — the "same participant cannot read
a record" scenario stays true, since that actor holds no `system:developer`
role either.

#### Scenario: A developer reads the record of an instance they started

- **WHEN** an actor holding `system:developer` but not `system:admin` calls
  `getInstanceRecord` for an instance whose `startedBy` matches their id
- **THEN** the call succeeds and returns the merged record

#### Scenario: A developer cannot read a record of an instance they did not start

- **WHEN** an actor holding `system:developer` but not `system:admin` calls
  `getInstanceRecord` for an instance whose `startedBy` does not match their
  id
- **THEN** it throws `AuthorizationError`

#### Scenario: A participant with neither role is still refused, even for their own instance

- **WHEN** an actor holding neither `system:admin` nor `system:developer`
  calls `getInstanceRecord` for an instance they themselves started
- **THEN** it throws `AuthorizationError`, unchanged from this capability's
  existing behavior

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

### Requirement: The reports role gates every reporting route

Every route under the `/reporting/*` prefix SHALL require `REPORTS_ROLE` on
the resolved `Actor`, before any query runs. The check uses the same direct
`requireRole` call every other role-gated route surface uses.

An actor lacking the role SHALL receive `403` and no result body, whether or
not the requested process exists. The check SHALL precede process resolution.
A caller without the role therefore cannot probe which process ids exist.

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
