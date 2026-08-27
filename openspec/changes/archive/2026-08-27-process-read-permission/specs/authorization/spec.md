## MODIFIED Requirements

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
