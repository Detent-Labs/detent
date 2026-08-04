<!-- antislop: allow-file passive-voice -->
## ADDED Requirements

### Requirement: A user's manager is assignable over HTTP

`src/auth/users.ts` SHALL expose a function setting `auth_users.manager_user_id`
for the row matching `user_id = $1`. It SHALL return the updated user summary. It
SHALL return `undefined` when no such `userId` exists.

This SHALL be exposed as `PATCH /admin/users/:id/manager`, gated by
`system:admin` through the same `requireRole` check every other `/admin/*` route
uses. The request body SHALL be `{ managerUserId: string | null }`, where `null`
clears the pointer.

The route SHALL return 200 with the updated row on success. It SHALL return 404
when the target user does not exist.

<!-- antislop: allow synonym-rotation -->
The route SHALL reject two cases with 400. Those are a `managerUserId` naming no
account, and a `managerUserId` equal to the `:id` being changed. A self-pointer
would name the starter as their own approver. That is an operator mistake rather
than an organizational fact. "Operator" is this spec's word for the administrator
persona, distinct from "user", the account being administered.

The route SHALL NOT reject a pointer closing a cycle between two accounts.
Nothing traverses the pointer, so a cycle has no effect.

#### Scenario: Assigning a manager

- **WHEN** `PATCH /admin/users/:id/manager` is requested for an existing user by
  an actor holding `system:admin`, with another existing account's id
- **THEN** the response is 200, the returned row names that manager, and
  `auth_users` holds it

#### Scenario: Clearing a manager

- **WHEN** `PATCH /admin/users/:id/manager` is requested with
  `{ "managerUserId": null }`
- **THEN** the response is 200 and that user's `manager_user_id` is `NULL`

#### Scenario: A manager naming no account is refused

- **WHEN** `PATCH /admin/users/:id/manager` names a `userId` absent from
  `auth_users`
- **THEN** the response is 400 and no row is written

#### Scenario: A user cannot be their own manager

- **WHEN** `PATCH /admin/users/:id/manager` names the same user being changed
- **THEN** the response is 400 and no row is written

#### Scenario: Assigning a manager to an unknown user

- **WHEN** `PATCH /admin/users/:id/manager` is requested for a `userId` that
  does not exist in `auth_users`
- **THEN** the response is 404 and no row is written

#### Scenario: An actor without the role is refused

- **WHEN** `PATCH /admin/users/:id/manager` is requested with a resolvable
  credential whose `roles` does not include `system:admin`
- **THEN** the response is 403 and no row is written
