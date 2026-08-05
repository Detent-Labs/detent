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
