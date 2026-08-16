## ADDED Requirements

### Requirement: A process-scoped gate asks one function over two tests

Six gated operations name one process. The engine SHALL route each one through
a single pair of functions in `src/auth/authorize.ts`. Grant storage lives
behind that pair, so no call site reads a grant.

The engine SHALL define a `Permission` type of exactly three string values:
`"publish"`, `"cancel"` and `"migrate"`. These SHALL be the only permissions
this capability defines. A permission names an operation whose target is one
process. It is not a role, and no deployment grants one to an actor.

The engine SHALL expose `can(actor: Actor, permission: Permission, processId:
ProcessId, db: SQL): Promise<boolean>`. It SHALL answer one question: may
`actor` carry out `permission` on the process `processId` names? A
`PERMISSION_ROLE` map holds the reserved role each permission takes:

- `"publish"` takes `PUBLISH_ROLE`
- `"cancel"` takes `CANCEL_ANY_ROLE`
- `"migrate"` takes `DEVELOPER_ROLE`

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

Five gates SHALL await `requirePermission` in place of a bare `requireRole`:

- `handlePublish` and `handlePublishDraft`, with `"publish"`
- `handleGetMigrationPlan` and `handlePutMigrationPlan`, with `"migrate"`
- `handleGetOrphanKeys`, with `"migrate"`

The sixth site is `cancelInstance`. It awaits `can` where it holds a loaded
instance. The requirement named "An instance's starter may cancel it without
the reserved role" states that placement.

Every operation whose target is not one process SHALL keep the gate it has:

- every `/admin/*` route calls `requireRole` with `ADMIN_ROLE`
- every `/reporting/*` route calls `requireRole` with `REPORTS_ROLE`
- the two template writes call `requireRole` with `TEMPLATES_ROLE`
- the `scope=all` listing gate calls `requireRole` with `ADMIN_ROLE`
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
- **AND** the `Permission` type admits `"publish"`, `"cancel"` and `"migrate"`
- **AND** the `Permission` type admits no fourth value

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

- **WHEN** an actor calls any of the six gated operations, over a store holding
  no grant row
- **THEN** the operation admits the actors it admitted before this change
- **AND** it refuses the actors it refused before this change

## MODIFIED Requirements

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
resolves three fixed permissions through one compile-time map. It reaches no
registry. It loads no code. A caller SHALL NOT be able to add a permission,
replace the map, or supply a policy.

A grant is data, not policy. It names a role, one of the three fixed
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
- **THEN** it is a module constant covering exactly three permissions
- **AND** no exported function adds an entry to it

#### Scenario: A grant carries no policy

- **WHEN** an operator writes a grant
- **THEN** it names a role, a permission and a scope, and nothing else
- **AND** no grant denies a permission the global role already admits

## ADDED Requirements

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

## REMOVED Requirements

### Requirement: A process-scoped gate asks one function

**Reason**: The requirement described a seam whose body was a placeholder. Its
central rule reads "The `processId` argument SHALL NOT change the answer". That
rule is the one thing this change reverses. A scoped grant is precisely a
`processId` that changes the answer. Two of its scenarios rest on that rule.
`can`'s signature also gains a `db` argument and a `Promise` return, so no
scenario in it survives unedited.

"A process-scoped gate asks one function over two tests" replaces it in full.
That replacement keeps every rule that still holds. Those are the three fixed
permissions, the private `PERMISSION_ROLE` map, the six call sites, and the
gates that stay global.

**Migration**: None for a deployment. An installation that writes no grant
keeps every answer it had. The replacing requirement
asserts that as its own scenario. In-process callers of `can` and
`requirePermission` await them and pass the `SQL` handle. The replacing
requirement names the six of them in this repository.
