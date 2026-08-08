## REMOVED Requirements

<!-- The header must match the base spec character for character, or the delta
     removes no requirement. Its wording is not this change's to fix. -->
<!-- antislop: allow passive-voice -->
### Requirement: Users are administered from a CLI, never over HTTP

**Reason**: The header names a rule this change ends. Creating an account and
setting a password now have an admin-gated HTTP door. "Never over HTTP" no
longer describes the engine. The requirement below replaces it. That one keeps
the CLI commands and the absent registration flow as they are today.

**Migration**: No data moves and no CLI command changes. `src/auth/cli.ts` keeps
`add-user`, `set-password`, its roles command and its manager command. A
deployment that provisions accounts from a shell keeps working unchanged.

## ADDED Requirements

### Requirement: Account administration is reachable over HTTP, and the CLI keeps its own path

`src/auth/cli.ts` SHALL provide a command-line tool
(`bun run src/auth/cli.ts add-user …`). It SHALL create a user, set that user's
roles, change a user's password, and set that user's manager. It SHALL also set
that user's display name. Each command SHALL keep its email key. A person at a
terminal types an address, not a `user_id`.

`add-user` SHALL accept an optional trailing display-name argument.
`createUser` trims that argument the same way for every caller, per the
requirement above. A whitespace-only value from the CLI therefore leaves
`display_name` `NULL`, the same as an omitted argument.

The engine SHALL provide no registration flow, no self-service password-reset
flow and no MFA flow. No route SHALL let an unauthenticated caller create an
account or set a password.

Eight routes SHALL administer accounts over HTTP. The `admin-user-management`
capability defines them, and `system:admin` gates each one.

- `GET /admin/users`
- `POST /admin/users`
- `POST /admin/users/:id/disable`
- `POST /admin/users/:id/enable`
- `PATCH /admin/users/:id/roles`
- `PATCH /admin/users/:id/manager`
- `PATCH /admin/users/:id/name`
- `POST /admin/users/:id/password`

The CLI SHALL stay the recovery path for a deployment where no account holds
`system:admin`. That state locks all eight routes, and a shell is what remains.

#### Scenario: The CLI creates a user

- **WHEN** the CLI's `add-user` command runs with an email, a password and roles
- **THEN** a row exists in `auth_users` with that email, those roles, and a hash
  that verifies the given password

#### Scenario: The CLI creates a user with a display name

- **WHEN** the CLI's `add-user` command runs with an email, a password, roles,
  and a display name
- **THEN** a row exists in `auth_users` holding that trimmed display name

#### Scenario: A whitespace-only display name from the CLI resolves to email

- **WHEN** the CLI's `add-user` or `set-name` command runs with a
  whitespace-only string as the display name
- **THEN** that user's `display_name` is `NULL`, not an empty string, and the
  resolved display name is that user's email

#### Scenario: The CLI sets a manager

- **WHEN** the CLI's manager command runs with a user's email and another
  account's email
- **THEN** that user's `manager_user_id` holds the second account's `user_id`

#### Scenario: The CLI sets a display name

- **WHEN** the CLI's `set-name` command runs with a user's email and a display
  name
- **THEN** that user's `display_name` holds the trimmed value

#### Scenario: No route outside the admin gate creates an account

- **WHEN** a reader walks the server's route table
- **THEN** no route creates a user or sets a password outside the eight this
  requirement lists
- **AND** each of those eight refuses an actor whose roles omit `system:admin`

#### Scenario: No route registers a caller

- **WHEN** an unauthenticated caller looks for a registration route
- **THEN** the server's route table holds none

#### Scenario: The HTTP disable route stops a login

- **WHEN** `POST /admin/users/:id/disable` disables a user, and that user then
  tries to log in
- **THEN** `verifyLogin` rejects the try
- **AND** it rejects it exactly as for a user any other path disabled

#### Scenario: The CLI and the route write the same column

- **WHEN** `PATCH /admin/users/:id/roles` sets a user's roles
- **AND** the CLI or a login then reads that user's roles
- **THEN** the value read is the one the route wrote, from the same column

#### Scenario: The CLI and the route store a password the same way

- **WHEN** the CLI's `set-password` sets a password for one account
- **AND** `POST /admin/users/:id/password` sets a password for another account
- **THEN** each row holds a `Bun.password.hash` result, and a login verifies both
