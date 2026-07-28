## MODIFIED Requirements

### Requirement: Users are administered from a CLI, never over HTTP

`src/auth/cli.ts` SHALL provide a command-line tool
(`bun run src/auth/cli.ts add-user …`) to create a user, set that user's roles,
and change a user's password. The engine SHALL expose no HTTP route for
creating, modifying passwords or roles for, or registering users, and SHALL
provide no registration, password-reset or MFA flow.

Listing users and toggling a user's `disabled` state ARE additionally
reachable over HTTP, through the `system:admin`-gated routes defined by the
`admin-user-management` capability (`GET /admin/users`, `POST
/admin/users/:id/disable`, `POST /admin/users/:id/enable`). This is the one
carve-out from CLI-only administration: no other field or action on
`auth_users` (email, password, roles) is reachable outside the CLI.

#### Scenario: A user is created from the CLI

- **WHEN** the CLI's `add-user` command is run with an email, a password and
  roles
- **THEN** a row exists in `auth_users` with that email, those roles, and a
  hash that verifies the given password

#### Scenario: No route creates, changes a password for, or assigns roles to a user

- **WHEN** the server's route table is inspected
- **THEN** no route creates a user, sets a password, or assigns roles; the
  only account-administration routes are `GET /admin/users`, `POST
  /admin/users/:id/disable` and `POST /admin/users/:id/enable`, which only
  list users or toggle `disabled`

#### Scenario: A user disabled via the new HTTP route cannot log in

- **WHEN** a user is disabled via `POST /admin/users/:id/disable` and then
  attempts to log in
- **THEN** `verifyLogin` rejects the attempt exactly as it already does for a
  user disabled by any other means (the pre-existing "A disabled user cannot
  log in" scenario)
