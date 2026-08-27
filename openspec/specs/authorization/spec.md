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

The engine SHALL define eight reserved role strings in `src/auth/authorize.ts`:

- `PUBLISH_ROLE = "system:publish"`
- `CANCEL_ANY_ROLE = "system:cancel-any"`
- `ADMIN_ROLE = "system:admin"`
- `DEVELOPER_ROLE = "system:developer"`
- `REPORTS_ROLE = "system:reports"`
- `DATALISTS_ROLE = "system:datalists"`
- `TEMPLATES_ROLE = "system:templates"`
- `AUTHOR_ROLE = "system:author"`

These SHALL be the only roles this capability defines. No role hierarchy,
wildcard or general permission model SHALL exist. In particular no one of them
SHALL imply any other.

The `system:` prefix is a naming convention only. It marks these
engine-reserved roles off from the free-form business roles a deployment
assigns for `Step.assignment`, such as `"finance-approver"`. Nothing enforces
the prefix structurally, since `Actor.roles` and `auth_users.roles` stay plain
`string[]`.

#### Scenario: The module exports the reserved role constants

- **WHEN** a reader inspects `src/auth/authorize.ts` for its exports
- **THEN** it exports `PUBLISH_ROLE` with value `"system:publish"`,
  `CANCEL_ANY_ROLE` with value `"system:cancel-any"`, `ADMIN_ROLE` with value
  `"system:admin"`, `DEVELOPER_ROLE` with value `"system:developer"`,
  `REPORTS_ROLE` with value `"system:reports"`, `DATALISTS_ROLE` with value
  `"system:datalists"`, `TEMPLATES_ROLE` with value `"system:templates"` and
  `AUTHOR_ROLE` with value `"system:author"`

#### Scenario: The admin role implies nothing

- **WHEN** `requireRole(actor, PUBLISH_ROLE)` runs for an actor whose
  `roles` is exactly `["system:admin"]`
- **THEN** it throws `AuthorizationError`

#### Scenario: The developer role implies nothing

- **WHEN** `requireRole(actor, PUBLISH_ROLE)` or `requireRole(actor,
  ADMIN_ROLE)` runs for an actor whose `roles` is exactly
  `["system:developer"]`
- **THEN** it throws `AuthorizationError`

#### Scenario: The reports role implies nothing

- **WHEN** `requireRole(actor, PUBLISH_ROLE)`, `requireRole(actor, ADMIN_ROLE)`
  or `requireRole(actor, DEVELOPER_ROLE)` runs for an actor whose `roles`
  is exactly `["system:reports"]`
- **THEN** it throws `AuthorizationError`

#### Scenario: No other reserved role implies the reports role

- **WHEN** `requireRole(actor, REPORTS_ROLE)` runs for an actor whose
  `roles` is exactly `["system:admin"]`, exactly `["system:developer"]`,
  exactly `["system:publish"]` or exactly `["system:cancel-any"]`
- **THEN** it throws `AuthorizationError` in each case

#### Scenario: The data list role implies nothing

- **WHEN** `requireRole(actor, ADMIN_ROLE)`, `requireRole(actor,
  DEVELOPER_ROLE)` or `requireRole(actor, CANCEL_ANY_ROLE)` runs for an
  actor whose `roles` is exactly `["system:datalists"]`
- **THEN** it throws `AuthorizationError` in each case

#### Scenario: No other reserved role implies the data list role

- **WHEN** `requireRole(actor, DATALISTS_ROLE)` runs for an actor whose
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

### Requirement: A process-scoped gate asks one function over two tests

Seven gated operations name one process. The engine SHALL route each one
through a single pair of functions in `src/auth/authorize.ts`. Grant storage
lives behind that pair, so no call site reads a grant.

The engine SHALL define a `Permission` type of exactly four string values:
`"publish"`, `"cancel"`, `"migrate"` and `"read"`. These SHALL be the only
permissions this capability defines. A permission names an operation whose
target is one process. It is not a role, and no deployment grants one to an
actor.

The engine SHALL expose `can(actor: Actor, permission: Permission, processId:
ProcessId, db: SQL): Promise<boolean>`. It SHALL answer one question: may
`actor` carry out `permission` on the process `processId` names? A
`PERMISSION_ROLE` map holds the reserved role each permission takes:

- `"publish"` takes `PUBLISH_ROLE`
- `"cancel"` takes `CANCEL_ANY_ROLE`
- `"migrate"` takes `DEVELOPER_ROLE`
- `"read"` takes `ADMIN_ROLE`

`"read"` SHALL take `ADMIN_ROLE` rather than `REPORTS_ROLE`. `REPORTS_ROLE`
answers whether an actor may reach the reporting area at all. That is a
different question from which process's data an actor may see. One role
answering both would leave an installation no way to narrow the second.

`can` SHALL answer true where either of two tests passes. It SHALL run them in
this order:

1. **The global role.** `actor.roles` holds the mapped reserved role. This test
   SHALL run first and SHALL short-circuit. Where it passes, `can` SHALL read
   no row. An installation that writes no grant therefore pays nothing.
2. **A stored grant.** The grant store holds a matching row. Its permission
   equals `permission`, its role appears in `actor.roles`, and its scope
   resolves to `processId`.

The engine SHALL NOT read a scope out of a role string. A role string is a
principal the identity provider names. The grant rows are the one place a
scope lives. The engine therefore treats `system:publish@proc_…` in
`actor.roles` as a role like any other. It matches no grant unless an operator
writes a row naming that exact string.

`can` SHALL answer false where both fail. It SHALL NOT throw on an
unresolvable `processId`. A caller may pass a value naming no stored process.
The publish route reads its target out of an unvalidated request body.

`processId` therefore changes the answer. Two calls differing only in
`processId` MAY disagree. They SHALL disagree where a grant names one of the
two.

The engine SHALL expose `requirePermission(actor: Actor, permission:
Permission, processId: ProcessId, db: SQL): Promise<void>`. It SHALL throw the
existing `AuthorizationError` where `can` answers false. It SHALL return with no
effect where `can` answers true. It SHALL NOT define a second error type.

The `PERMISSION_ROLE` map SHALL stay private to its module. No caller outside
`src/auth/authorize.ts` SHALL read it or replace it.

Six gates SHALL await `requirePermission` in place of a bare `requireRole`:

- `handlePublish` and `handlePublishDraft`, with `"publish"`
- `handleGetMigrationPlan` and `handlePutMigrationPlan`, with `"migrate"`
- `handleGetOrphanKeys`, with `"migrate"`
- the `scope=all` instance listing, with `"read"`

The seventh site is `cancelInstance`. It awaits `can` where it holds a loaded
instance. The requirement named "An instance's starter may cancel it without
the reserved role" states that placement.

Every operation whose target is not one process SHALL keep the gate it has:

- every `/admin/*` route calls `requireRole` with `ADMIN_ROLE`
- every `/reporting/*` route calls `requireRole` with `REPORTS_ROLE`
- the two template writes call `requireRole` with `TEMPLATES_ROLE`
- the four draft routes call `requireAuthoring`, the two-role helper in
  `src/http/studio-routes.ts`, and the template reads call `requireStudioRead`

A draft carries its `proc_` id from its first save, since `drafts.process_id`
is the table's key and `PUT /drafts/:processId` names it. The four draft routes
are therefore scopeable, and this change leaves them global on purpose. A
draft-scoped `"author"` permission is a later change, and it moves those four
call sites and the drafts list. `requireRole` SHALL stay exported and SHALL
stay synchronous.

#### Scenario: The module exports the permission seam

- **WHEN** a reader reads the exports of `src/auth/authorize.ts`
- **THEN** it exports `can` and `requirePermission`
- **AND** the `Permission` type admits `"publish"`, `"cancel"`, `"migrate"` and
  `"read"`
- **AND** the `Permission` type admits no fifth value

#### Scenario: A global role holder passes

- **WHEN** `can(actor, "publish", processId, db)` runs for an actor whose
  `roles` includes `"system:publish"`
- **THEN** it answers true

#### Scenario: An actor holding neither role nor grant gets false

- **WHEN** `can(actor, "publish", processId, db)` runs for an actor whose
  `roles` omits `"system:publish"`, over a store holding no grant
- **THEN** it answers false

#### Scenario: Each permission takes its own role

- **WHEN** `can` runs for an actor holding `"system:developer"` alone, over a
  store holding no grant
- **THEN** `"migrate"` answers true
- **AND** `"publish"` answers false
- **AND** `"cancel"` answers false
- **AND** `"read"` answers false

#### Scenario: The operator role carries the read permission

- **WHEN** `can(actor, "read", processId, db)` runs for an actor holding
  `"system:admin"` alone, over a store holding no grant
- **THEN** it answers true without reading the grant store

#### Scenario: The reports role does not carry the read permission

- **WHEN** `can(actor, "read", processId, db)` runs for an actor holding
  `"system:reports"` alone, over a store holding no grant
- **THEN** it answers false

#### Scenario: A read grant admits one process and not another

- **WHEN** the store holds a grant of `"read"` to the role `"hr-reporting"`
  over process A
- **AND** `can` runs for an actor whose `roles` is exactly `["hr-reporting"]`
- **THEN** `"read"` answers true for process A
- **AND** `"read"` answers false for process B
- **AND** `"cancel"` answers false for process A

#### Scenario: A grant admits one process and not another

- **WHEN** the store holds a grant of `"publish"` to the role
  `"finance-authors"` over process A
- **AND** `can` runs for an actor whose `roles` is exactly `["finance-authors"]`
- **THEN** it answers true for process A
- **AND** it answers false for process B

#### Scenario: A grant admits one permission and not another

- **WHEN** that same actor and that same grant reach `can` with `"cancel"` over
  process A
- **THEN** it answers false

#### Scenario: A role string carries no scope

- **WHEN** `can(actor, "publish", processId, db)` runs for an actor whose
  `roles` is exactly `["system:publish@" + processId]`, over a store holding no
  grant
- **THEN** it answers false

#### Scenario: The global role short-circuits the store

- **WHEN** `can(actor, "publish", processId, db)` runs for an actor holding
  `"system:publish"`
- **THEN** it answers true without reading the grant store

#### Scenario: An unresolvable process id answers rather than throwing

- **WHEN** `can(actor, "publish", processId, db)` runs with a `processId` that
  names no stored process
- **THEN** it answers, and does not throw

#### Scenario: requirePermission throws where can answers false

- **WHEN** `requirePermission(actor, "cancel", processId, db)` runs for an actor
  whose `roles` is an empty array
- **THEN** it rejects with `AuthorizationError`

#### Scenario: requirePermission returns where can answers true

- **WHEN** `requirePermission(actor, "migrate", processId, db)` runs for an
  actor whose `roles` includes `"system:developer"`
- **THEN** it resolves without throwing

#### Scenario: An installation with no grants keeps today's answers

- **WHEN** an actor calls any of the seven gated operations, over a store
  holding no grant row
- **THEN** the operation admits the actors it admitted before this change
- **AND** it refuses the actors it refused before this change

### Requirement: A grant scope carries the plugin envelope

A grant's scope SHALL take the `{ type, config }` shape the definition contract
gives actions, data sources and assignment strategies. The engine SHALL define
exactly one type in this version: `{ type: "process", config: { processId } }`.
It matches the one process its `processId` names, and no other.

The engine SHALL reject a scope carrying an unknown `type`, at the write path
rather than at read time. A stored grant SHALL stay readable after a later
version adds a second type.

A later scope type SHALL enumerate to a finite set of process ids from the
store alone. The reasoning sits in `design.md`. The `scope=all` listing and the
reporting aggregates turn this gate into a filter. A filter needs the set
rather than a per-id answer.

A scope SHALL carry the opaque process `id`, never the `key`. The definition
contract lets a `key` change and lets it reference nothing. A key-scoped grant
would therefore follow a rename to the wrong process, or to none.

The engine SHALL NOT check that a scope's `processId` resolves to a stored
process. A grant is a row about a role. An operator writes it before or after
the process exists.

A draft carries its `proc_` id from its first save. An operator reads the id
off the draft and writes the grant ahead of the first publish. Take a process
id nobody has published, that no grant names. A first publish under that id
therefore still needs the global `system:publish`.

#### Scenario: The store accepts the process scope type

- **WHEN** an operator writes a grant whose scope is `{ type: "process",
  config: { processId } }`
- **THEN** the store accepts it

#### Scenario: The engine refuses an unknown scope type on write

- **WHEN** an operator writes a grant whose scope `type` is not `"process"`
- **THEN** the engine refuses the write
- **AND** the store holds no row for it

#### Scenario: A grant may name a process that does not exist yet

- **WHEN** an operator writes a grant scoped to a `processId` no stored process
  carries
- **THEN** the store accepts it
- **AND** `can` answers true for that process once somebody publishes it under
  that id

#### Scenario: A first publish without a grant needs the global role

- **WHEN** an actor holding no `system:publish` publishes a process id that no
  stored process and no grant names
- **THEN** the engine refuses with `AuthorizationError`

### Requirement: A grant names a role, never an individual account

A grant SHALL map a role string to a permission and a scope. It SHALL NOT name
one account. One row therefore covers every holder of that role. The holder may
get the role from `auth_users.roles` or from an external issuer's claim.

The identity provider stays the authority on who someone is and which groups
they hold. The installation stays the authority on what a group may do inside
it. `Actor.roles` SHALL keep its `string[]` shape, and `auth_users.roles` SHALL
keep its `TEXT[]` shape. A sync from Active Directory or Entra ID therefore
needs no new field.

A grant's role SHALL be free text. The engine SHALL NOT need the `system:`
prefix on it. It SHALL NOT need any account to hold that role today. A grant
written ahead of the directory sync that creates the group is valid and inert.

An external issuer's claim value reaches `actor.roles` verbatim, through
`claimToRoles` in `src/auth/jwt.ts`. Entra ID's `groups` claim emits object
ids by default. A grant to such a group therefore names the object id, and
the listing shows that id. That is a display concern for a later operator screen,
not a rule of the store.

The eight `system:*` roles SHALL keep their exact meaning. They serve the cases
that are genuinely installation-wide. Account administration, the outbox and
the timer views stay behind `system:admin`. A scoped grant is a second and
narrower
thing beside them. It SHALL NOT replace one, and no migration SHALL rewrite a
role anybody already holds.

#### Scenario: One grant covers every holder of a role

- **WHEN** the store holds one grant of `"publish"` to `"finance-authors"`
  scoped to a process, and two accounts hold `"finance-authors"`
- **THEN** `can` answers true for both, over that process

#### Scenario: A business role takes a grant

- **WHEN** an operator writes a grant whose role is `"finance-authors"`, with
  no `system:` prefix
- **THEN** the store accepts it

#### Scenario: A grant for a role nobody holds admits nobody

- **WHEN** the store holds a grant to a role no account and no token claim
  carries
- **THEN** `can` answers false for every actor

#### Scenario: A grant grants no installation-wide access

- **WHEN** an actor's only permission comes from a grant of `"publish"` scoped
  to one process
- **THEN** every `/admin/*` route, every `/reporting/*` route and every studio
  route answers `403` for that actor, unchanged

<!-- Why: the header below has to match the requirement heading in the live
     spec, byte for byte. Its wording predates the permission seam. -->
<!-- antislop: allow passive-voice -->
### Requirement: Authorization is checked directly at each gated operation, not through an extension point

This capability gates six kinds of operation:

- publishing a process body
- cancelling an arbitrary instance
- reading the unfiltered instance listing
- reading an instance's record
- every `/admin/*` route
- every studio route

No plugin envelope, registry, or
configurable policy SHALL exist for authorization. Each gated operation calls
`requireRole` or `requirePermission` directly. Each passes its own fixed role
constant or permission. The engine already follows that pattern for the single
`"static"` check on `Step.assignment.strategy.type`.

`requirePermission` SHALL NOT weaken that rule. It reads the same
`Actor.roles`, in the same module, and one table of stored rows beside them. It
resolves four fixed permissions through one compile-time map. It reaches no
registry. It loads no code. A caller SHALL NOT be able to add a permission,
replace the map, or supply a policy.

A grant is data, not policy. It names a role, one of the four fixed
permissions, and a scope. It carries no expression, no ordering, no priority
and no deny form. Two grants over one process combine by answering true, which
is what a set of independent tests already does.

#### Scenario: No authorization plugin registry exists

- **WHEN** a reader reads the engine's `Registry`, `DataSourceRegistry` and
  `AssignmentRegistry` extension points
- **THEN** no authorization or permission registry stands alongside them

#### Scenario: Each admin route calls requireRole directly

- **WHEN** a reader reads `src/http/admin-routes.ts`
- **THEN** each handler calls `requireRole(actor, ADMIN_ROLE)` itself, with no
  policy abstraction between them

#### Scenario: Each studio route calls requireRole directly

- **WHEN** a reader reads `src/http/studio-routes.ts`
- **THEN** each handler calls `requireRole` or `requirePermission` itself, with
  no policy abstraction between them
- **AND** the two template writes call `requireRole` with `TEMPLATES_ROLE`,
  while the four draft routes call the `requireAuthoring` helper beside it
- **AND** the publish route, the two migration-plan routes and the orphan-key
  route await `requirePermission` with their fixed permission

#### Scenario: The permission map does not extend

- **WHEN** a reader reads the `PERMISSION_ROLE` map
- **THEN** it is a module constant covering exactly four permissions
- **AND** no exported function adds an entry to it

#### Scenario: A grant carries no policy

- **WHEN** an operator writes a grant
- **THEN** it names a role, a permission and a scope, and nothing else
- **AND** no grant denies a permission the global role already admits

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

`cancelInstance` (`src/runtime/api.ts`) SHALL first try `requireRole(actor,
CANCEL_ANY_ROLE)`, before any instance lookup. Where that throws
`AuthorizationError`, `cancelInstance` SHALL NOT pass the rejection on. It
SHALL load the instance instead, and SHALL permit the cancellation where either
test passes:

- `await can(actor, "cancel", instance.processId, db)` answers true
- `instance.startedBy === actor.id`

An actor who started an instance may cancel it without holding
`system:cancel-any`. An abandoned start therefore does not strand an unassigned
running instance. That bypass SHALL stay specific to `cancelInstance`. It SHALL
NOT become a reserved role of its own, or a general "owner" permission model.
It SHALL NOT extend to publish. It SHALL NOT let a starter cancel an instance
they did not start.

The `can` test sits in the loaded branch for one reason. A scoped grant names a
process, and the process id arrives with the instance. The load-free fast path
therefore keeps asking the global question alone. A grant holder pays one
instance load that a `system:cancel-any` holder does not. The two tests SHALL
stay independent, so that neither one masks the other.

#### Scenario: A starter without the reserved role cancels their own instance

- **WHEN** an actor who lacks `system:cancel-any`, but whose id matches the
  instance's `startedBy`, calls `cancelInstance`
- **THEN** the cancellation succeeds

#### Scenario: A grant holder cancels an instance they did not start

- **WHEN** the store holds a grant of `"cancel"` over the instance's process,
  to a role the actor holds
- **AND** that actor lacks `system:cancel-any` and did not start the instance
- **THEN** the cancellation succeeds

#### Scenario: A grant for another process does not cancel this instance

- **WHEN** that same actor's only grant names a different process
- **THEN** it throws `AuthorizationError`

#### Scenario: A non-starter without the reserved role is still rejected

- **WHEN** an actor who lacks `system:cancel-any`, holds no grant over the
  instance's process, and did not start the instance calls `cancelInstance`
- **THEN** it throws `AuthorizationError`

#### Scenario: A refusal still discloses no instance

- **WHEN** an actor who lacks `system:cancel-any` calls `cancelInstance` over
  an instance id that resolves to nothing
- **THEN** it throws `AuthorizationError`
- **AND** that error matches the one it throws over an instance that exists,
  and that the actor did not start

#### Scenario: The fast path stays load-free

- **WHEN** an actor holding `system:cancel-any` calls `cancelInstance`
- **THEN** the role test passes before any instance lookup runs

### Requirement: The operator role gates the operator-facing reads and routes

`ADMIN_ROLE` SHALL gate every `/admin/*` route and, additionally, `GET
/instances/:instanceId/record`. The `scope=mine` listing SHALL remain open to
every authenticated actor. An actor holding no reserved role therefore still
participates fully in the instances it is a candidate for.

The unfiltered instance listing (`GET /instances` with `scope=all` or with
`scope` omitted) SHALL NOT rest on a flat `ADMIN_ROLE` test. It SHALL rest on
the process-scoped gate with the `"read"` permission, which takes `ADMIN_ROLE`
as its reserved role. An actor holding `ADMIN_ROLE` therefore reaches that
listing exactly as before, without a grant and without a named process. The
`http-wrapper` capability states what an actor lacking that role SHALL send.

This is a **BREAKING** tightening. An account that read a record without
holding `system:admin` loses that read. An operator restores it with the
existing `src/auth/cli.ts set-roles`.

#### Scenario: A participant can still see their own work

- **WHEN** an actor holding no reserved role requests `GET /instances?scope=mine`
- **THEN** the response is 200 and carries their assignments

#### Scenario: The same participant cannot see everything

- **WHEN** that actor requests `GET /instances?scope=all` or `GET /instances`
  with no `scope`
- **THEN** the response is 403

#### Scenario: The operator still sees everything without a grant

- **WHEN** an actor holding `system:admin` requests `GET /instances?scope=all`
  over a store holding no grant row
- **THEN** the response is 200 and carries every instance summary

#### Scenario: The same participant cannot read a record

- **WHEN** that actor requests `GET /instances/:id/record`, including for an
  instance they started
- **THEN** the response is 403

### Requirement: A developer may read the record of an instance they started, without the reserved role

`getInstanceRecord` (`src/runtime/api.ts`) SHALL first try
`requireRole(actor, ADMIN_ROLE)`. When that throws `AuthorizationError`,
`getInstanceRecord` SHALL NOT propagate the rejection. It SHALL instead load
the instance and SHALL permit the read when `instance.startedBy === actor.id`
and `actor.roles` includes `DEVELOPER_ROLE` or `AUTHOR_ROLE`. Either authoring
role therefore reads the record of an instance created through its own Studio
Player session, without holding `system:admin`. The Player renders that record
beside the form, and both roles reach the Player.

This bypass SHALL be `getInstanceRecord`-specific, mirroring `cancelInstance`'s
existing starter bypass for `system:cancel-any`. It SHALL NOT extend to any
other operator-facing read or route. It SHALL NOT let either authoring role
read the record of an instance it did not start.

A caller satisfying neither `ADMIN_ROLE` nor the authoring-and-starter pair
SHALL learn nothing about the target instance from a failed try. Two cases
SHALL collapse to the same `AuthorizationError`. One is an unresolvable
instance id. The other is a resolvable instance that is neither theirs nor
readable by role.

That preserves the guarantee this capability already holds for
`cancelInstance`. The engine rejects a role-less caller before any instance
state becomes observable to it.

This addition leaves the requirement above untouched, the one gating `GET
/instances/:id/record` behind `system:admin`. An actor holding none of
`system:admin`, `system:developer` and `system:author` still gets
`AuthorizationError`, even for an instance they themselves started. The "same
participant cannot read a record" scenario stays true, since that actor holds
no authoring role either.

#### Scenario: A developer reads the record of an instance they started

- **WHEN** an actor holding `system:developer` but not `system:admin` calls
  `getInstanceRecord` for an instance whose `startedBy` matches their id
- **THEN** the call succeeds and returns the merged record

#### Scenario: An author reads the record of an instance they started

- **WHEN** an actor holding `system:author` but not `system:admin` calls
  `getInstanceRecord` for an instance whose `startedBy` matches their id
- **THEN** the call succeeds and returns the merged record

#### Scenario: A developer cannot read a record of an instance they did not start

- **WHEN** an actor holding `system:developer` but not `system:admin` calls
  `getInstanceRecord` for an instance whose `startedBy` does not match their
  id
- **THEN** it throws `AuthorizationError`

#### Scenario: An author cannot read a record of an instance they did not start

- **WHEN** an actor holding `system:author` but not `system:admin` calls
  `getInstanceRecord` for an instance whose `startedBy` does not match their
  id
- **THEN** it throws `AuthorizationError`

#### Scenario: A participant with no authoring role is still refused, even for their own instance

- **WHEN** an actor holding none of `system:admin`, `system:developer` and
  `system:author` calls `getInstanceRecord` for an instance they themselves
  started
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

`DEVELOPER_ROLE` SHALL admit every studio route. It SHALL be the only role the
two migration-plan routes and the orphan-key scan admit. Every other studio
route SHALL admit `system:author` as well. The three studio reads the
`system:templates` requirement below names SHALL admit that role too.

`DEVELOPER_ROLE` SHALL NOT grant any operation the other reserved roles gate.
Publishing a process body SHALL keep its separate need for `system:publish`.
The operator reads and the `/admin/*` routes SHALL keep their need for
`system:admin`.

No route loses a caller. Every account holding `system:developer` reaches
exactly what it reached before. An operator grants studio access through the
existing `src/auth/cli.ts set-roles`.

#### Scenario: A developer reaches the authoring surface

- **WHEN** an actor holding `system:developer` calls a studio route
- **THEN** the engine authorizes the request

#### Scenario: A developer does not thereby gain publish or admin rights

- **WHEN** an actor holding only `system:developer` calls `POST /processes` or
  an `/admin/*` route
- **THEN** the response is 403

#### Scenario: The developer role alone reaches the migration routes

- **WHEN** an actor holding `system:developer` calls either migration-plan
  route or the orphan-key scan
- **THEN** the engine authorizes the request
- **AND** the engine refuses the same call from an actor holding only
  `system:author`

#### Scenario: No existing caller loses a route

- **WHEN** this change lands
- **THEN** every account holding `system:developer` still reaches every studio
  route it reached beforehand

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
/templates` and `GET /templates/:key`, together with `system:developer` and
`system:author`. Those two roles read a template so that every author can seed
a process from one.

The narrow grant is the point. Staff who curate a template must not gain the
power to publish a process. They must not gain the power to cancel an instance
or to administer an account.

`system:templates` SHALL also admit `GET
/processes/:processId/versions/:version`, the published body a curator creates
a template from, together with `system:developer` and `system:author`. It SHALL
NOT admit any draft route. A draft holds unfinished, private work. A published
body is the one every participant already runs.

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

#### Scenario: An author reads the template list
- **WHEN** an actor holding only `system:author` calls `GET /templates`
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

### Requirement: A system:author role gates the no-code authoring subset

`AUTHOR_ROLE = "system:author"` SHALL admit every route a person needs to build
a process without a developer. Those are the four draft routes, the publish
route beside `system:publish`, `GET /registry`, the two template reads and the
published version body.

Three routes outside the studio prefix join that set, because the studio
screens call them:

- `GET /admin/data-lists`, which fills the `"db.list"` picker in the data-source
  panel. It already admits `system:developer` for that one reason.
- `GET /instances/:id/record` for an instance the actor started, which the
  Player renders beside the form. The requirement below carries that rule.
- `GET /processes/:processId/versions`, which needs a session and no reserved
  role, so it admits this role already.

`GET /registry` belongs in the set on purpose. Two callers read it. One is the
Tools screen. The other is the studio inspector's plugin-config form, which
turns a registered type's config schema into a form. An author who cannot
call that route falls back to raw JSON for every action config. Avoiding that
fallback is why the role exists.

`system:author` SHALL NOT admit the two migration-plan routes or the orphan-key
scan. Those three stay behind `system:developer` alone. An analyst authors a
process. That work must not carry the power to rewrite the state of every
running instance on a version.

`system:author` SHALL NOT admit any data list write, nor any other `/admin/*`
route. The read is the whole grant there, matching what `system:developer`
already holds.

The role SHALL imply nothing else, and no other reserved role SHALL imply it.
An actor holding `system:author` alone SHALL NOT publish, cancel an instance,
administer an account or write a template.

The grant widens. No route this role reaches becomes closed to any role that
reached it before.

#### Scenario: An author reads and writes a draft

- **WHEN** an actor holding only `system:author` PUTs a draft and then GETs it
- **THEN** the engine authorizes both requests

#### Scenario: An author reads the registry

- **WHEN** an actor holding only `system:author` calls `GET /registry`
- **THEN** the engine authorizes the request and answers with the
  config-schema descriptions

#### Scenario: An author reaches no migration route

- **WHEN** an actor holding only `system:author` calls either migration-plan
  route or the orphan-key scan
- **THEN** the response is `403` in each case

#### Scenario: The author role implies nothing

- **WHEN** an actor whose `roles` is exactly `["system:author"]` reaches
  `requireRole(actor, PUBLISH_ROLE)`, `requireRole(actor, ADMIN_ROLE)`,
  `requireRole(actor, DEVELOPER_ROLE)` or `requireRole(actor, TEMPLATES_ROLE)`
- **THEN** it throws `AuthorizationError` in each case

#### Scenario: No other reserved role implies the author role

- **WHEN** `requireRole(actor, AUTHOR_ROLE)` runs for an actor whose
  `roles` is exactly `["system:admin"]`, exactly `["system:developer"]` or
  exactly `["system:templates"]`
- **THEN** it throws `AuthorizationError` in each case

#### Scenario: An author seeds a draft from a template

- **WHEN** an actor holding only `system:author` calls `GET /templates`, `GET
  /templates/:key` or `GET /processes/:processId/versions/:version`
- **THEN** the engine authorizes each request

#### Scenario: An author writes no template

- **WHEN** an actor holding only `system:author` calls `PUT /templates/:key` or
  `DELETE /templates/:key`
- **THEN** the response is `403` in both cases

#### Scenario: An author publishes only with the publish role

- **WHEN** an actor holding only `system:author` calls `POST
  /drafts/:processId/publish`
- **THEN** the response is `403`
- **AND** the engine authorizes that same actor once they also hold
  `system:publish`

#### Scenario: An author reads the data list keys

- **WHEN** an actor holding only `system:author` calls `GET /admin/data-lists`
- **THEN** the engine authorizes the request

#### Scenario: An author writes no data list

- **WHEN** that same actor calls a data list write route
- **THEN** the response is `403`

#### Scenario: An author reads the record of an instance they started

- **WHEN** an actor holding only `system:author` calls `GET
  /instances/:id/record` for an instance whose `startedBy` matches their id
- **THEN** the engine authorizes the request

#### Scenario: An author reads no record of an instance they did not start

- **WHEN** that same actor calls the record route for an instance whose
  `startedBy` names somebody else
- **THEN** the engine throws `AuthorizationError`
