<!-- The MODIFIED block below copies the live admin-user-management
     requirement, apart from the paragraph and the scenario this change
     rewrites. That file carries the findings already, and a rewrite here
     would make the delta and its destination disagree. This directive dies
     with the change, at archive time. -->
<!-- antislop: allow-file passive-voice sentence-length run-ons long-words -->

## MODIFIED Requirements

### Requirement: A user can be disabled over HTTP

`src/auth/users.ts` SHALL expose `setDisabled(userId, disabled, db)`, which
SHALL set `auth_users.disabled` to the given boolean for the row matching
`user_id = $1` and return the updated `{ userId, email, roles, disabled }`, or
`undefined` when no such `userId` exists. This SHALL be exposed as `POST
/admin/users/:id/disable` (calling `setDisabled(id, true, db)`), gated by
`system:admin`, returning 200 with the updated row on success and 404 when
`setDisabled` returns `undefined`.

Disabling SHALL take effect on that user's next request, not on their next
login. The resolver reads the account behind every locally issued token, so a
token issued before the disable stops resolving at once. See
`jwt-authentication`. The login path SHALL keep rejecting a disabled account
as it does today.

An externally issued token SHALL keep its own issuer's behavior. This engine
holds no `auth_users` row for such an actor, so `setDisabled` does not reach
that identity. Revoking it is the identity provider's operation.

#### Scenario: Disabling a user

- **WHEN** `POST /admin/users/:id/disable` is requested for an existing user
  by an actor holding `system:admin`
- **THEN** the response is 200, the row's `disabled` is `true`, and a
  subsequent login attempt for that user fails

#### Scenario: Disabling an unknown user

- **WHEN** `POST /admin/users/:id/disable` is requested for a `userId` that
  does not exist in `auth_users`
- **THEN** the response is 404

#### Scenario: A token issued before disabling stops authenticating

- **WHEN** a user logs in, is then disabled, and presents the token issued
  before the disable to another route before that token's `exp`
- **THEN** the request is rejected with `401`, and the route's handler does
  not run

### Requirement: A role change does not reach an already-issued token

A role assignment SHALL take effect on that user's *next* login. It SHALL NOT
change the roles carried by a JWT already issued to that user. The resolver
reads the account behind a locally issued token to learn whether that account
is still live, and it reads nothing else. `Actor.roles` keeps coming from the
token's own `roles` claim. A token issued before the assignment therefore
keeps that claim until its `exp`.

Reading `roles` from that same row instead would make a grant reach a live
session. This requirement records that the change did not do so. A disable
ends a session outright, so the operator has one control that acts at once. A
grant is not that control.

#### Scenario: A token issued before the change keeps its old roles

- **WHEN** a user logs in and then has a role granted
- **AND** that user presents the token issued before the grant to a route
  gated by that role
- **THEN** the request is refused, unaffected by the grant

#### Scenario: The next login carries the new roles

- **WHEN** that user logs in again after the grant
- **THEN** the issued token's `roles` claim holds the granted role
