## MODIFIED Requirements

### Requirement: An instance's starter may cancel it without the reserved role

`cancelInstance` (`src/runtime/api.ts`) SHALL first try `requireRole(actor,
CANCEL_ANY_ROLE)`, before any instance lookup. Where that throws
`AuthorizationError`, `cancelInstance` SHALL NOT pass the rejection on. It
SHALL load the instance instead, and SHALL permit the cancellation where
either test passes:

- `await can(actor, "cancel", instance.processId, db)` answers true
- `instance.startedBy === actor.id`, AND the instance's current step resolves
  `cancellable` to `true` under the `cancellation` capability's
  process/step-default rule

An actor who started an instance may cancel it without holding
`system:cancel-any`, as long as the instance's current step is cancellable.
An abandoned start therefore does not strand an unassigned running instance.
That holds unless the process owner deliberately set that step's, or the
whole process's, `cancellable` to `false`. There, only the two role/grant
tests above still admit the cancellation. That bypass SHALL stay specific to
`cancelInstance`. It SHALL NOT become a reserved role of its own, or a general
"owner" permission model. It SHALL NOT extend to publish. It SHALL NOT let a
starter cancel an instance they did not start.

The `cancellable` gate SHALL apply to the starter test alone. It SHALL NOT
apply to `CANCEL_ANY_ROLE` or to a stored `cancel` grant. An operator holding
either MUST remain able to cancel any running instance no matter what its
process or step declares. This is deliberate. Without it, a process
owner declaring a step not participant-cancellable could produce a running
instance no one can cancel. This capability treats that outcome as
strictly worse than the narrower authorization the gate otherwise adds.

The `can` test sits in the loaded branch for one reason. A scoped grant names a
process, and the process id arrives with the instance. The load-free fast path
therefore keeps asking the global question alone. A grant holder pays one
instance load that a `system:cancel-any` holder does not. The two tests SHALL
stay independent, so that neither one masks the other.

#### Scenario: A starter without the reserved role cancels their own instance

- **WHEN** an actor who lacks `system:cancel-any`, but whose id matches the
  instance's `startedBy`, calls `cancelInstance` for an instance resting on a
  cancellable step
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

- **WHEN** an actor who lacks `system:cancel-any`, has no grant over the
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

#### Scenario: The gate refuses a starter at a non-cancellable step

- **WHEN** an actor who lacks `system:cancel-any` and has no `"cancel"`
  grant, but whose id matches the instance's `startedBy`, calls
  `cancelInstance` for an instance resting on a step whose effective
  `cancellable` resolves to `false`
- **THEN** it throws `AuthorizationError`

#### Scenario: An operator still cancels at a non-cancellable step

- **WHEN** an actor holding `system:cancel-any`, or holding a stored
  `"cancel"` grant over the instance's process, calls `cancelInstance` for an
  instance resting on a step whose effective `cancellable` resolves to
  `false`, and that actor did not start the instance
- **THEN** the cancellation succeeds

#### Scenario: An admin-role-only starter faces the same gate as any other starter

- **WHEN** an actor holding only `system:admin`, with neither
  `system:cancel-any` nor a stored `"cancel"` grant, calls `cancelInstance`
  for an instance they themselves started. That instance rests on a step
  whose effective `cancellable` resolves to `false`
- **THEN** it throws `AuthorizationError`, the same as any other starter
  receives. The `system:admin` role alone does not imply `system:cancel-any`,
  and this capability's roles imply nothing else
