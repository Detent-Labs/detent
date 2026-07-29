<!-- antislop: allow-file all -->

## ADDED Requirements

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

The existing requirement gating `GET /instances/:id/record` behind
`system:admin` is untouched by this addition: an actor holding neither
`system:admin` nor `system:developer` still gets `AuthorizationError`, even
for an instance they themselves started — the scenario "The same participant
cannot read a record" stays true, since that actor holds no
`system:developer` role either.

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
