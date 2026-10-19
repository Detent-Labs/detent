## MODIFIED Requirements

### Requirement: A process-scoped gate asks one function over two tests

Ten gated operations name one process. The engine SHALL route each one
through a single pair of functions in `src/auth/authorize.ts`. Grant storage
lives behind that pair, so no call site reads a grant.

The engine SHALL define a `Permission` type of exactly five string values:
`"publish"`, `"cancel"`, `"migrate"`, `"read"` and `"visibility"`. These SHALL
be the only permissions this capability defines. A permission names an operation whose
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
- `"visibility"` takes `ADMIN_ROLE`

`"read"` SHALL take `ADMIN_ROLE` rather than `REPORTS_ROLE`. `REPORTS_ROLE`
answers whether an actor may reach the reporting area at all. That is a
different question from which process's data an actor may see. One role
answering both would leave an installation no way to narrow the second.

`"visibility"` gates changing who may see one instance, per the
`instance-visibility-set` capability. It takes `ADMIN_ROLE` too, so today only
an operator performs it.

It exists as a permission rather than a bare role check for one reason. An
installation may later want a per-process administrator who manages visibility
on their own process and nothing else. Writing a grant of `"visibility"` over
that process admits exactly that actor. No code changes, and no role string
carries a scope.

`can` SHALL answer true where any of `permission`'s own tests passes. Every
permission runs these two tests, in this order:

1. **The global role.** `actor.roles` holds the mapped reserved role. This test
   SHALL run first and SHALL short-circuit. Where it passes, `can` SHALL read
   no row. An installation that writes no grant therefore pays nothing.
2. **A stored grant.** The grant store holds a matching row. Its permission
   equals `permission`, its role appears in `actor.roles`, and its scope
   resolves to `processId`.

`"read"` alone SHALL run one further test, third in order:

3. **The process's Reader list.** The `process-access-roles` capability's
   Reader list for `processId` names a principal. A principal is the
   actor's id, or one of the actor's groups. This test SHALL run only for
   `"read"`. It SHALL NOT run for `"publish"`, `"cancel"`, `"migrate"` or
   `"visibility"`.

The engine SHALL NOT read a scope out of a role string. A role string is a
principal the identity provider names. The grant rows are the one place a
scope lives. The engine therefore treats `system:publish@proc_…` in
`actor.roles` as a role like any other. It matches no grant unless an operator
writes a row naming that exact string.

`can` SHALL answer false where every one of `permission`'s tests fails. It
SHALL NOT throw on an unresolvable `processId`. A caller may pass a value
naming no stored process. The publish route reads its target out of an
unvalidated request body.

`processId` therefore changes the answer. Two calls differing only in
`processId` MAY disagree. They SHALL disagree where a grant names one of the
two.

The engine SHALL expose `requirePermission(actor: Actor, permission:
Permission, processId: ProcessId, db: SQL): Promise<void>`. It SHALL throw the
existing `AuthorizationError` where `can` answers false. It SHALL return with no
effect where `can` answers true. It SHALL NOT define a second error type.

The `PERMISSION_ROLE` map SHALL stay private to its module. No caller outside
`src/auth/authorize.ts` SHALL read it or replace it.

Nine gates SHALL await `requirePermission` in place of a bare `requireRole`:

- `handlePublish` and `handlePublishDraft`, with `"publish"`
- `handleGetMigrationPlan` and `handlePutMigrationPlan`, with `"migrate"`
- `handleGetOrphanKeys`, with `"migrate"`
- the `scope=all` instance listing, with `"read"`
- the three instance-visibility routes, with `"visibility"`

Those three sit under `/instances/:instanceId/visibility*`, beside
`handleCancel`, not under `/admin/*`. An `/admin/*` route calls `requireRole`
with a fixed role, and the rule below keeps that true.

The tenth site is `cancelInstance`. It awaits `can` where it holds a loaded
instance. The requirement named "An instance's starter may cancel it without
the reserved role" states that placement.

Every operation whose target is not one process SHALL keep the gate it has:

- every `/admin/*` route calls `requireRole` with `ADMIN_ROLE`, except the
  data list routes, which the `system:datalists` requirement below gates
- every `/reporting/*` route calls `requireRole` with `REPORTS_ROLE`
- the two template writes call `requireRole` with `TEMPLATES_ROLE`
- the four draft routes call `requireAuthoring`, the two-role helper in
  `src/http/studio-routes.ts`, and the template reads call `requireStudioRead`

A draft carries its `proc_` id from its first save. `drafts.process_id` is
the table's key, and `PUT /drafts/:processId` names it. The
`process-access-roles` capability's Developer list scopes the four draft
routes, the two publish routes and the drafts list instead. The two publish
routes still await `requirePermission` with `"publish"`, and the list check
follows it. That list works alongside this seam's
`Permission` value, not through it. A grant in this seam names a role. A
Developer list names an actor or a group, so the two mechanisms stay
separate. `requireRole` SHALL stay exported and SHALL stay synchronous.

#### Scenario: The module exports the permission seam

- **WHEN** a reader reads the exports of `src/auth/authorize.ts`
- **THEN** it exports `can` and `requirePermission`
- **AND** the `Permission` type admits `"publish"`, `"cancel"`, `"migrate"`,
  `"read"` and `"visibility"`
- **AND** the `Permission` type admits no sixth value

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

<!-- antislop: allow negation-habit -->
<!-- title matches the archived requirement's scenario exactly, per OpenSpec's MODIFIED-block rule. -->
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

- **WHEN** an actor calls any of the ten gated operations, over a store
  holding no grant row
- **AND** the process carries an empty Reader list
- **THEN** the operation admits the actors it admitted before this change
- **AND** it refuses the actors it refused before this change

#### Scenario: The visibility permission answers for an operator

- **WHEN** `can(actor, "visibility", processId, db)` runs for an actor holding
  `"system:admin"`
- **THEN** it answers true, reading no grant row

#### Scenario: A visibility grant narrows to one process

- **WHEN** the store holds a grant of `"visibility"` to the role
  `"hr-process-admin"` over process A
- **AND** an actor holding that role calls `can` for each process
- **THEN** `"visibility"` answers true for process A
- **AND** `"visibility"` answers false for process B

#### Scenario: A process's Reader list satisfies the read permission

- **WHEN** `can(actor, "read", processId, db)` runs for an actor whose id
  or group appears on that process's Reader list
- **AND** the store has no matching `"read"` grant
- **AND** the actor has no reserved role
- **THEN** it answers true

#### Scenario: A Reader-list match satisfies no other permission

- **WHEN** `can(actor, "cancel", processId, db)` runs for that same actor
  and process
- **THEN** it answers false

#### Scenario: A publish grant does not stand in for a Developer list entry

- **WHEN** an actor holds a stored grant of `"publish"` scoped to one process
- **AND** the actor holds `system:author` but is not on that process's Developer
  list
- **THEN** `can(actor, "publish", processId, db)` answers true
- **AND** the two publish routes still refuse the actor with 403

### Requirement: The operator role gates the operator-facing reads and routes

`ADMIN_ROLE` SHALL gate every `/admin/*` route except the data list routes,
and, additionally, `GET /instances/:instanceId/record`. The
`system:datalists` requirement below gates the data list routes. The
`scope=mine` listing SHALL remain open to
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

### Requirement: The developer role gates the authoring surface

`DEVELOPER_ROLE` SHALL admit every studio route except five. The
`system:templates` requirement below gates the two template writes. The
`process-access-roles` lists gate the three `/processes/:processId/access`
routes.

The `process-access-roles` Developer list narrows seven more routes: the four
draft routes, the two publish routes and the drafts list. The rule takes
hold once a process has a draft or a published version. From then on, a
non-admin caller on one of the six process routes SHALL stand on its
Developer list. The drafts list SHALL return to a non-admin only the drafts
whose Developer list names them.

Of the reserved roles, only `DEVELOPER_ROLE` SHALL admit the two
migration-plan routes and the orphan-key scan. A stored `migrate` grant
admits a caller there too. Every other studio route that `DEVELOPER_ROLE`
admits SHALL admit `system:author` as well. The three studio reads the
`system:templates` requirement below names SHALL admit that role too.

`DEVELOPER_ROLE` SHALL NOT grant any operation the other reserved roles gate.
Publishing a process body SHALL keep its separate need for `system:publish`.
The operator reads and the `/admin/*` routes other than the data list routes
SHALL keep their need for `system:admin`.

An operator grants studio access through the existing
`src/auth/cli.ts set-roles`.

#### Scenario: A developer reaches the authoring surface

- **WHEN** an actor holding `system:developer` calls a studio route
- **AND** the actor stands on the Developer list of the process the route names
- **THEN** the engine authorizes the request

<!-- antislop: allow long-words - OpenSpec matches a MODIFIED block's scenario names against the live spec, so this heading keeps its wording -->
#### Scenario: A developer does not thereby gain publish or admin rights

- **WHEN** an actor holding only `system:developer` calls `POST /processes` or
  an `/admin/*` route other than a data list read
- **THEN** the response is 403

#### Scenario: The developer role alone reaches the migration routes

- **WHEN** an actor holding `system:developer` calls either migration-plan
  route or the orphan-key scan
- **THEN** the engine authorizes the request
- **AND** the engine refuses the same call from an actor holding only
  `system:author`

#### Scenario: No existing caller loses a route

- **WHEN** an account holding `system:developer` calls a studio route whose
  only gate is a role `system:developer` satisfies, such as `GET /registry`,
  `GET /templates` or a migration-plan route
- **THEN** the engine authorizes the request, whatever list the account
  stands on

### Requirement: A system:datalists role gates data list maintenance

`system:datalists` SHALL gate every data list write route. It SHALL admit the
data list reads together with the two authoring roles. Those are
`system:developer` and `system:author`, so the studio can offer the existing
keys as a choice.

The narrow grant is the point. Staff who maintain value lists must not gain
the power to cancel instances or to publish a process.

#### Scenario: The role gates a data list write
- **WHEN** an actor holding `system:datalists` writes a data list
- **THEN** the route accepts it

#### Scenario: An admin does not inherit data list write access
- **WHEN** an actor holding only `system:admin` writes a data list
- **THEN** the route answers with an authorization error

### Requirement: A grant names a role, never an individual account

A grant SHALL map a role string to a permission and a scope. It SHALL NOT name
one account. One row therefore covers every holder of that role. The holder may
get the role from `auth_users.roles` or from an external issuer's claim.

The identity provider stays the authority on who someone is and which groups
they hold. The installation stays the authority on what a group may do inside
it. `Actor.roles` SHALL keep its `string[]` shape, and `auth_users.roles` SHALL
keep its `TEXT[]` shape. A sync from Active Directory or Entra ID therefore
does not need a new field.

A grant's role SHALL be free text. The engine SHALL NOT need the `system:`
prefix on it. It SHALL NOT need any account to hold that role today. A grant
written ahead of the directory sync that creates the group is valid and inert.

An external issuer's claim value reaches `actor.roles` verbatim, through
`claimToRoles` in `src/auth/jwt.ts`. Entra ID's `groups` claim emits object
ids by default. A grant to such a group therefore names the object id, and
the listing shows that id. That is a concern for a later operator screen.
The store makes no rule of it.

The reserved `system:*` roles SHALL keep their exact meaning. They serve the cases
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
<!-- antislop: allow passive-voice trailing-negation -->
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
resolves five fixed permissions through one compile-time map. It reaches no
registry. It loads no code. A caller SHALL NOT be able to add a permission,
replace the map, or supply a policy.

A grant is plain data. It names a role, one of the five
fixed permissions, and a scope. It has no expression, no ordering, no priority
and no deny form. Two grants over one process combine by answering true, which
is what a set of independent tests already does.

#### Scenario: No authorization plugin registry exists

- **WHEN** a reader reads the engine's `Registry`, `DataSourceRegistry` and
  `AssignmentRegistry` extension points
- **THEN** no authorization or permission registry stands alongside them

#### Scenario: Each admin route calls requireRole directly

- **WHEN** a reader reads `src/http/admin-routes.ts`
- **THEN** each handler calls `requireRole` itself, with no policy abstraction
  between them
- **AND** each handler passes `ADMIN_ROLE`, except the data list handlers,
  which pass `DATALISTS_ROLE`
- **AND** a data list read admits either authoring role before that call

#### Scenario: Each studio route calls requireRole directly

- **WHEN** a reader reads `src/http/studio-routes.ts`
- **THEN** each role-gated handler calls `requireRole` or `requirePermission`
  itself, with no policy abstraction between them
- **AND** the two template writes call `requireRole` with `TEMPLATES_ROLE`,
  while the four draft routes call the `requireAuthoring` helper beside it
- **AND** the publish route, the two migration-plan routes and the orphan-key
  route await `requirePermission` with their fixed permission
- **AND** the three `/processes/:processId/access` routes and
  `GET /processes/access/mine` take no role gate
- **AND** `src/auth/process-access.ts` authorizes the two access writes, and
  the access read checks `ADMIN_ROLE` or the Developer list inline

#### Scenario: The permission map does not extend

- **WHEN** a reader reads the `PERMISSION_ROLE` map
- **THEN** it is a module constant covering exactly five permissions
- **AND** no exported function adds an entry to it

<!-- antislop: allow negation-habit - OpenSpec matches a MODIFIED block's scenario names against the live spec, so this heading keeps its wording -->
#### Scenario: A grant carries no policy

- **WHEN** an operator writes a grant
- **THEN** it names a role, a permission and a scope, and nothing else
- **AND** no grant denies a permission the global role already admits
