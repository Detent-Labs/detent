## MODIFIED Requirements

### Requirement: Reserved role constants gate process-admin operations

The engine SHALL define ten reserved role strings in `src/auth/authorize.ts`:

- `PUBLISH_ROLE = "system:publish"`
- `CANCEL_ANY_ROLE = "system:cancel-any"`
- `ADMIN_ROLE = "system:admin"`
- `DEVELOPER_ROLE = "system:developer"`
- `REPORTS_ROLE = "system:reports"`
- `DATALISTS_ROLE = "system:datalists"`
- `TEMPLATES_ROLE = "system:templates"`
- `AUTHOR_ROLE = "system:author"`
- `CREATE_ROLE = "system:create"`
- `OWNER_ROLE = "system:owner"`

These SHALL be the only roles this capability defines. No role hierarchy,
wildcard or general permission model SHALL exist. In particular no one of them
SHALL imply any other.

The `system:` prefix is a naming convention only. It marks these
engine-reserved roles off from the free-form business roles a deployment
assigns for `Step.assignment`, such as `"finance-approver"`. Nothing enforces
the prefix structurally, since `Actor.roles` and `auth_users.roles` stay plain
`string[]`.

`CREATE_ROLE` gates creating a brand-new process, alongside `DEVELOPER_ROLE`
or `AUTHOR_ROLE`. The `process-drafts` capability states that rule. `OWNER_ROLE`
is the eligibility rule for a process's Owner list. The `process-access-roles`
capability states that rule. Neither role reaches any other gated operation.

#### Scenario: The module exports the reserved role constants

- **WHEN** a reader inspects `src/auth/authorize.ts` for its exports
- **THEN** it exports `PUBLISH_ROLE` with value `"system:publish"`,
  `CANCEL_ANY_ROLE` with value `"system:cancel-any"`, `ADMIN_ROLE` with value
  `"system:admin"`, `DEVELOPER_ROLE` with value `"system:developer"`,
  `REPORTS_ROLE` with value `"system:reports"`, `DATALISTS_ROLE` with value
  `"system:datalists"`, `TEMPLATES_ROLE` with value `"system:templates"`,
  `AUTHOR_ROLE` with value `"system:author"`, `CREATE_ROLE` with value
  `"system:create"` and `OWNER_ROLE` with value `"system:owner"`

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

#### Scenario: The create role implies nothing

- **WHEN** `requireRole(actor, ADMIN_ROLE)` or `requireRole(actor,
  DEVELOPER_ROLE)` runs for an actor whose `roles` is exactly
  `["system:create"]`
- **THEN** it throws `AuthorizationError` in each case

#### Scenario: No other reserved role implies the create role

- **WHEN** `requireRole(actor, CREATE_ROLE)` runs for an actor whose `roles`
  is exactly `["system:admin"]`, exactly `["system:developer"]` or exactly
  `["system:author"]`
- **THEN** it throws `AuthorizationError` in each case

#### Scenario: The owner role implies nothing

- **WHEN** `requireRole(actor, ADMIN_ROLE)` or `requireRole(actor,
  DEVELOPER_ROLE)` runs for an actor whose `roles` is exactly
  `["system:owner"]`
- **THEN** it throws `AuthorizationError` in each case

#### Scenario: No other reserved role implies the owner role

- **WHEN** `requireRole(actor, OWNER_ROLE)` runs for an actor whose `roles`
  is exactly `["system:admin"]`, exactly `["system:developer"]` or exactly
  `["system:author"]`
- **THEN** it throws `AuthorizationError` in each case

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
with `ADMIN_ROLE`, and the rule below keeps that true.

The tenth site is `cancelInstance`. It awaits `can` where it holds a loaded
instance. The requirement named "An instance's starter may cancel it without
the reserved role" states that placement.

Every operation whose target is not one process SHALL keep the gate it has:

- every `/admin/*` route calls `requireRole` with `ADMIN_ROLE`
- every `/reporting/*` route calls `requireRole` with `REPORTS_ROLE`
- the two template writes call `requireRole` with `TEMPLATES_ROLE`
- the four draft routes call `requireAuthoring`, the two-role helper in
  `src/http/studio-routes.ts`, and the template reads call `requireStudioRead`

A draft carries its `proc_` id from its first save. `drafts.process_id` is
the table's key, and `PUT /drafts/:processId` names it. The
`process-access-roles` capability's Developer list scopes the four draft
routes and the drafts list instead. That list works alongside this seam's
`Permission` value, not through it. A grant in this seam names a role. A
Developer list names an actor or a group, so the two mechanisms stay
separate. `requireRole` SHALL stay exported and SHALL stay synchronous.

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
