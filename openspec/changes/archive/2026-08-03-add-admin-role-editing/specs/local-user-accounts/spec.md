<!-- antislop: allow-file passive-voice -->

## MODIFIED Requirements

### Requirement: Users are administered from a CLI, never over HTTP

`src/auth/cli.ts` SHALL provide a command-line tool
(`bun run src/auth/cli.ts add-user …`) to create a user, set that user's roles,
and change a user's password. The engine SHALL expose no HTTP route that
creates a user, changes a password, or registers anyone. It SHALL provide no
registration flow, no password-reset flow and no MFA flow.

Three actions ARE reachable over HTTP: listing users, toggling a user's
`disabled` state, and assigning a user's roles. The `admin-user-management`
capability defines four `system:admin`-gated routes for them.

- `GET /admin/users`
- `POST /admin/users/:id/disable`
- `POST /admin/users/:id/enable`
- `PATCH /admin/users/:id/roles`

This is the carve-out from CLI-only administration. Creating a user and setting
a password stay outside it. Neither one is reachable except from the CLI.

#### Scenario: A user is created from the CLI

- **WHEN** the CLI's `add-user` command is run with an email, a password and
  roles
- **THEN** a row exists in `auth_users` with that email, those roles, and a
  hash that verifies the given password

#### Scenario: No route creates a user or changes a password

- **WHEN** the server's route table is inspected
- **THEN** no route creates a user or sets a password
- **AND** the account-administration routes are exactly the four this
  requirement lists

#### Scenario: A user disabled via the new HTTP route cannot log in

<!-- antislop: allow sentence-length long-words -->

- **WHEN** a user is disabled via `POST /admin/users/:id/disable` and then
  attempts to log in
- **THEN** `verifyLogin` rejects the attempt exactly as it already does for a
  user disabled by any other means (the pre-existing "A disabled user cannot
  log in" scenario)

#### Scenario: The CLI and the route write the same column

- **WHEN** `PATCH /admin/users/:id/roles` sets a user's roles
- **AND** the CLI or a login then reads that user's roles
- **THEN** the value read is the one the route wrote, from the same column
