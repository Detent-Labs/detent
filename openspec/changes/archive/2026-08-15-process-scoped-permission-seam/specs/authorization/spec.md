## ADDED Requirements

### Requirement: A process-scoped gate asks one function

Six gated operations name one process. The engine SHALL route each one through
a single pair of functions in `src/auth/authorize.ts`. A later change to grant
storage then moves one module, not six call sites.

The engine SHALL define a `Permission` type of exactly three string values:
`"publish"`, `"cancel"` and `"migrate"`. These SHALL be the only permissions
this capability defines. A permission names an operation whose target is one
process. It is not a role, and no deployment grants one to an actor.

The engine SHALL expose `can(actor: Actor, permission: Permission, processId:
ProcessId): boolean`. It SHALL answer whether `actor` may perform `permission`
on the process that `processId` names. Its whole body today is the global-role
check that already ships. A `PERMISSION_ROLE` map names the reserved role each
permission takes:

- `"publish"` takes `PUBLISH_ROLE`
- `"cancel"` takes `CANCEL_ANY_ROLE`
- `"migrate"` takes `DEVELOPER_ROLE`

The `processId` argument SHALL NOT change the answer. It exists so that a
scoped grant has a place to land later. Two calls that differ only in
`processId` SHALL agree.

The engine SHALL expose `requirePermission(actor: Actor, permission:
Permission, processId: ProcessId): void`. It SHALL throw the existing
`AuthorizationError` where `can` answers false. It SHALL return without effect
where `can` answers true. It SHALL NOT define a second error type.

The `PERMISSION_ROLE` map SHALL stay private to its module. No caller outside
`src/auth/authorize.ts` SHALL read it or replace it.

Five gates SHALL call `requirePermission` in place of a bare `requireRole`:

- `handlePublish` and `handlePublishDraft`, with `"publish"`
- `handleGetMigrationPlan` and `handlePutMigrationPlan`, with `"migrate"`
- `handleGetOrphanKeys`, with `"migrate"`

The sixth site is `cancelInstance`. It asks `can` where it holds a loaded
instance. The requirement named "An instance's starter may cancel it without
the reserved role" states that placement.

Every operation whose target is not one process SHALL keep the gate it has:

- every `/admin/*` route calls `requireRole` with `ADMIN_ROLE`
- every `/reporting/*` route calls `requireRole` with `REPORTS_ROLE`
- the two template writes call `requireRole` with `TEMPLATES_ROLE`
- the `scope=all` listing gate calls `requireRole` with `ADMIN_ROLE`
- the four draft routes call `requireAuthoring`, the two-role helper in
  `src/http/studio-routes.ts`, and the template reads call `requireStudioRead`

A draft holds no `proc_` id to name, so the two authoring roles stay global.
`requireRole` SHALL stay exported.

#### Scenario: The module exports the permission seam

- **WHEN** a reader reads the exports of `src/auth/authorize.ts`
- **THEN** it exports `can` and `requirePermission`
- **AND** the `Permission` type admits `"publish"`, `"cancel"` and `"migrate"`
- **AND** the `Permission` type admits no fourth value

#### Scenario: A permission holder passes

- **WHEN** `can(actor, "publish", processId)` runs for an actor whose `roles`
  includes `"system:publish"`
- **THEN** it answers true

#### Scenario: An actor missing the mapped role gets false

- **WHEN** `can(actor, "publish", processId)` runs for an actor whose `roles`
  omits `"system:publish"`
- **THEN** it answers false

#### Scenario: Each permission takes its own role

- **WHEN** `can` runs for an actor holding `"system:developer"` alone
- **THEN** `"migrate"` answers true
- **AND** `"publish"` answers false
- **AND** `"cancel"` answers false

#### Scenario: The process id does not change the answer

- **WHEN** `can(actor, permission, processId)` runs twice for one actor and one
  permission, over two different `processId` values
- **THEN** both calls answer the same

#### Scenario: requirePermission throws where can answers false

- **WHEN** `requirePermission(actor, "cancel", processId)` runs for an actor
  whose `roles` is an empty array
- **THEN** it throws `AuthorizationError`

#### Scenario: requirePermission returns where can answers true

- **WHEN** `requirePermission(actor, "migrate", processId)` runs for an actor
  whose `roles` includes `"system:developer"`
- **THEN** it returns without throwing

#### Scenario: No caller gains or loses access

- **WHEN** an actor calls any of the six gated operations
- **THEN** the operation admits the actors it admitted before the seam landed
- **AND** it refuses the actors it refused before the seam landed

## MODIFIED Requirements

<!-- Why: the header below has to match the existing requirement heading byte
     for byte, or the archive step drops the modification. Its wording predates
     this change. -->
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
`Actor.roles`, in the same module. It resolves three fixed permissions through
one compile-time map. It reaches no registry. It reads no configuration. A
caller SHALL NOT be able to add a permission, replace the map, or supply a
policy.

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
  route call `requirePermission` with their fixed permission

#### Scenario: The permission map does not extend

- **WHEN** a reader reads the `PERMISSION_ROLE` map
- **THEN** it is a module constant covering exactly three permissions
- **AND** no exported function adds an entry to it

### Requirement: An instance's starter may cancel it without the reserved role

`cancelInstance` (`src/runtime/api.ts`) SHALL first try `requireRole(actor,
CANCEL_ANY_ROLE)`, before any instance lookup. Where that throws
`AuthorizationError`, `cancelInstance` SHALL NOT pass the rejection on. It
SHALL load the instance instead, and SHALL permit the cancellation where either
test passes:

- `can(actor, "cancel", instance.processId)` answers true
- `instance.startedBy === actor.id`

An actor who started an instance may cancel it without holding
`system:cancel-any`. An abandoned start therefore does not strand an unassigned
running instance. That bypass SHALL stay specific to `cancelInstance`. It SHALL
NOT become a reserved role of its own, or a general "owner" permission model.
It SHALL NOT extend to publish. It SHALL NOT let a starter cancel an instance
they did not start.

The `can` test sits in the loaded branch for one reason. A scoped grant names a
process, and the process id arrives with the instance. The load-free fast path
therefore keeps asking the global question alone. Today `can` answers false
wherever the loaded branch reaches it. The fast path already put the same
question and lost. The two tests SHALL stay independent, so that neither one
masks the other once a grant carries a scope.

#### Scenario: A starter without the reserved role cancels their own instance

- **WHEN** an actor who lacks `system:cancel-any`, but whose id matches the
  instance's `startedBy`, calls `cancelInstance`
- **THEN** the cancellation succeeds

#### Scenario: A non-starter without the reserved role is still rejected

- **WHEN** an actor who lacks `system:cancel-any` and did not start the
  instance calls `cancelInstance`
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
