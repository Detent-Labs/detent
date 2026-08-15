## Purpose

Gives the operator an HTTP surface over the process-scoped permission grants
that `authorization` reads. The operator lists every grant, writes one, and
revokes one. A grant maps a role string to one of the three process-scoped
permissions, and to the process it covers. An installation can therefore say
"the finance authors publish the expense process", and hand them no other
process.

## ADDED Requirements

### Requirement: An operator lists, writes and revokes a grant over HTTP

The engine SHALL serve three routes under the `/admin/` prefix:

- `GET /admin/permission-grants` returns every stored grant.
- `POST /admin/permission-grants` writes one grant, from a body carrying
  `role`, `permission` and `scope`.
- `POST /admin/permission-grants/revoke` deletes one grant, from a body of the
  same three fields.

The triple `(role, permission, scope)` identifies a grant. The store SHALL hold
at most one row per triple. A write of a triple the store already holds SHALL
succeed and SHALL change nothing. A repeated call from a provisioning script is
therefore safe. A revoke of a triple the store does not hold SHALL succeed and
SHALL change nothing, for the same reason.

A revoke SHALL be exact. It SHALL NOT delete a grant of the same role over a
different process. It SHALL NOT delete one under a different permission, or
under a different scope type.

The route SHALL order the list. Two calls over an unchanged store therefore
return the same sequence.

#### Scenario: An operator writes and reads back a grant

- **WHEN** an operator POSTs a grant of `"publish"` to `"finance-authors"`
  scoped to a process, then GETs the list
- **THEN** the response carries that grant

#### Scenario: A repeated write changes nothing

- **WHEN** an operator POSTs the same grant twice
- **THEN** both calls succeed
- **AND** the list carries one row for it

#### Scenario: A revoke removes the grant

- **WHEN** an operator POSTs that grant to the revoke route, then GETs the list
- **THEN** the list no longer carries it

#### Scenario: A revoke of an absent grant succeeds

- **WHEN** an operator revokes a grant the store does not hold
- **THEN** the call succeeds
- **AND** the list carries what it carried before

#### Scenario: A revoke does not reach a sibling grant

- **WHEN** the store holds one grant of `"publish"` to a role over process A,
  and one over process B
- **AND** an operator revokes the process A grant
- **THEN** the process B grant survives

#### Scenario: The list order is stable

- **WHEN** an operator GETs the list twice over an unchanged store
- **THEN** both responses carry the same grants in the same order

### Requirement: The operator role gates every grant route

`system:admin` SHALL gate all three routes, before any read or write runs. The
check uses the same direct `requireRole` call every other `/admin/*` route uses.

The engine SHALL answer `403` and no body to an actor lacking the role. A grant
names which processes a role reaches, so the list itself is sensitive. An actor
without the role SHALL learn nothing from it. That covers which processes exist,
and which roles a deployment uses.

No grant SHALL open a grant route. Grant administration is installation-wide.
That is the third of stage 40's three groups, so it stays a global question
under `system:admin` alone.

#### Scenario: The engine refuses an actor without the operator role

- **WHEN** an actor whose `roles` omits `"system:admin"` calls any of the three
  routes
- **THEN** the response is `403` and carries no grant data

#### Scenario: A grant holder does not thereby administer grants

- **WHEN** an actor holding a grant of `"publish"` over a process, and no
  `system:admin`, calls the grant list
- **THEN** the response is `403`

#### Scenario: The engine admits an operator

- **WHEN** an actor holding `"system:admin"` calls the grant list
- **THEN** the response is `200`

### Requirement: The engine refuses a malformed grant body before any write

The engine SHALL validate a write body and a revoke body before either one
reaches the store. It SHALL answer `400` where the body fails. Four cases
fail:

- `role` missing, empty, or not a string.
- `permission` outside the three the `authorization` capability defines:
  `"publish"`, `"cancel"` and `"migrate"`.
- `scope` missing, or carrying a `type` other than `"process"`.
- A `"process"` scope whose `config.processId` is missing or does not match the
  `proc_` prefix a `ProcessId` requires.

The engine SHALL bound the stored strings the way the definition contract bounds
an authored `key`. A route therefore cannot write a row no reader can handle.

A `400` SHALL name which field failed. An operator writing a provisioning script
reads that message rather than guessing.

#### Scenario: The engine refuses an unknown permission

- **WHEN** an operator POSTs a grant whose `permission` is `"admin"`
- **THEN** the response is `400`
- **AND** the store holds no row for it

#### Scenario: The engine refuses an unknown scope type

- **WHEN** an operator POSTs a grant whose scope `type` is `"label"`
- **THEN** the response is `400`
- **AND** the store holds no row for it

#### Scenario: The engine refuses a scope with no process id

- **WHEN** an operator POSTs a `"process"` scope whose `config` carries no
  `processId`
- **THEN** the response is `400`
- **AND** the store holds no row for it

#### Scenario: The engine refuses an empty role

- **WHEN** an operator POSTs a grant whose `role` is the empty string
- **THEN** the response is `400`
- **AND** the store holds no row for it

#### Scenario: The error names the failing field

- **WHEN** any of the four cases above answers `400`
- **THEN** the error message names the field that failed

### Requirement: A grant takes effect on the next authorization call

A written grant SHALL take effect on the next gated call, with no restart and
no re-login. A revoked grant SHALL refuse on the next gated call.

The engine SHALL NOT cache a grant across requests. A token carries
`Actor.roles`, so that array stays subject to the token's lifetime.
`jwt-authentication` already states as much. The grant itself does not.

That differs on purpose from a role change on an account. The
`admin-user-management` capability states that a role change does not reach an
already-issued token. A grant rides in no token, so nothing stale holds it.

#### Scenario: A fresh grant admits at once

- **WHEN** an operator writes a grant
- **AND** the holder at once calls the gated operation with an unchanged session
- **THEN** the engine authorizes the call

#### Scenario: A revoke refuses at once

- **WHEN** an operator revokes that grant
- **AND** the holder at once repeats the call with the same session
- **THEN** the response is `403`
