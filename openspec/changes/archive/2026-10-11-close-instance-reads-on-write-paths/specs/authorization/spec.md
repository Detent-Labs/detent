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
`system:cancel-any`, as long as the instance's current step is cancellable. An
abandoned start therefore does not strand an unassigned running instance. That
holds unless the process owner deliberately set that step's, or the whole
process's, `cancellable` to `false`. There, only the two role and grant tests
above still admit the cancellation. That bypass SHALL stay specific to
`cancelInstance`. It SHALL NOT become a reserved role of its own, or a general
"owner" permission model. It SHALL NOT extend to publish. It SHALL NOT let a
starter cancel an instance they did not start.

The `cancellable` gate SHALL apply to the starter test alone. It SHALL NOT
apply to `CANCEL_ANY_ROLE` or to a stored `cancel` grant. An operator holding
either MUST remain able to cancel any running instance, whatever its process
or step declares. This is deliberate. Without it, a process owner declaring a
step not participant-cancellable could produce a running instance no one can
cancel. This capability treats that outcome as strictly worse than the
narrower authorization the gate otherwise adds.

The `can` test sits in the loaded branch for one reason. A scoped grant names a
process, and the process id arrives with the instance. The load-free fast path
therefore keeps asking the global question alone. A grant holder pays one
instance load that a `system:cancel-any` holder does not. The two tests SHALL
stay independent, so that neither one masks the other.

On a non-running instance, the starter test SHALL pass only while the starter
may read the instance. A starter whom a revocation names meets
`AuthorizationError`, unless a live assignment applies. "A write call reveals a
finished instance only to a reader" in `instance-visibility-set` states that
rule. The role test and the grant test sit outside it.

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

<!-- antislop: allow passive-voice - the scenario title must match the live spec verbatim, or archive drops it -->
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

#### Scenario: A revoked starter cannot cancel a finished instance

- **WHEN** an administrator revoked the starter of a completed instance
- **AND** the starter has no claim and no candidacy on its current step
- **AND** the starter calls `cancelInstance` for that instance
- **THEN** it throws `AuthorizationError`

### Requirement: A developer may read the record of an instance they started, without the reserved role

`getInstanceRecord` (`src/runtime/api.ts`) SHALL first try
`requireRole(actor, ADMIN_ROLE)`. When that throws `AuthorizationError`,
`getInstanceRecord` SHALL NOT propagate the rejection. It SHALL load the
instance instead. It SHALL permit the read when `instance.startedBy ===
actor.id` and `actor.roles` includes `DEVELOPER_ROLE` or `AUTHOR_ROLE`. A
revocation that refuses the starter overrides that permit. Either authoring role therefore reads the
record of an instance created through its own Studio Player session, without
holding `system:admin`. The Player renders that record beside the form, and
both roles reach the Player.

The revocation rule is the direct-read rule of `instance-visibility-set`. A
live assignment outranks the revocation. A test instance admits its starter
whatever a revocation says. The Player reads the record of a test instance, so
that case must keep working.

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

This addition leaves untouched the requirement that gates `GET
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

<!-- antislop: allow passive-voice - the scenario title must match the live spec verbatim, or archive drops it -->
#### Scenario: A participant with no authoring role is still refused, even for their own instance

- **WHEN** an actor holding none of `system:admin`, `system:developer` and
  `system:author` calls `getInstanceRecord` for an instance they themselves
  started
- **THEN** it throws `AuthorizationError`, as this capability already
  required

#### Scenario: A revoked author cannot read the record

- **WHEN** an actor holding `system:author` but not `system:admin` started an
  instance
- **AND** an administrator revoked that actor from it
- **AND** the actor has no claim and no candidacy on its current step
- **AND** the actor calls `getInstanceRecord` for that instance
- **THEN** it throws `AuthorizationError`
