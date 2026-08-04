<!-- antislop: allow-file passive-voice -->
## MODIFIED Requirements

### Requirement: Local users are persisted in an auth_users table

The engine SHALL create an `auth_users` table as part of the existing
`initSchema` DDL in `src/engine/store.ts`, alongside the other tables:

```sql
auth_users (
  user_id         text primary key,
  email           text unique not null,
  password_hash   text not null,
  roles           text[] not null default '{}',
  disabled        boolean not null default false,
  manager_user_id text references auth_users(user_id) on delete set null
)
```

`user_id` SHALL be the value used as `Actor.id`, the same value that appears in
`assignment.candidates`, `assignment.claimedBy` and `startedBy`. The table SHALL
be additive: an installation that never sets an auth environment variable is
unaffected by its presence.

`manager_user_id` SHALL be added by a statement changing an already-created
table. `CREATE TABLE IF NOT EXISTS` does not touch one that exists. A database
predating this change SHALL gain the column on the next start, with `NULL` in
every existing row. The `manager-of-starter-assignment` capability defines what
the column means and what reads it.

#### Scenario: The table is created by initSchema

- **WHEN** `initSchema` runs against an empty database
- **THEN** `auth_users` exists with a unique constraint on `email`

#### Scenario: Email is unique

- **WHEN** a second user is created with an email already present in
  `auth_users`
- **THEN** the creation fails and no second row is written

#### Scenario: An existing database gains the manager column

- **WHEN** `initSchema` runs against a database whose `auth_users` was created
  before this change
- **THEN** the table has `manager_user_id` and every pre-existing row holds
  `NULL`

### Requirement: Users are administered from a CLI, never over HTTP

`src/auth/cli.ts` SHALL provide a command-line tool
(`bun run src/auth/cli.ts add-user …`). It SHALL create a user, set that user's
roles, change a user's password, and set that user's manager.

The engine SHALL expose no HTTP route that creates a user, changes a password, or
registers anyone. It SHALL provide no registration flow, no password-reset flow
and no MFA flow.

Four actions ARE reachable over HTTP. Those are listing users, toggling a user's
`disabled` state, assigning a user's roles, and setting a user's manager. The
`admin-user-management` capability defines five `system:admin`-gated routes for
them.

- `GET /admin/users`
- `POST /admin/users/:id/disable`
- `POST /admin/users/:id/enable`
- `PATCH /admin/users/:id/roles`
- `PATCH /admin/users/:id/manager`

This is the carve-out from CLI-only administration. Creating a user and setting
a password stay outside it. Neither one is reachable except from the CLI.

#### Scenario: A user is created from the CLI

- **WHEN** the CLI's `add-user` command is run with an email, a password and
  roles
- **THEN** a row exists in `auth_users` with that email, those roles, and a
  hash that verifies the given password

#### Scenario: A manager is set from the CLI

- **WHEN** the CLI's manager command is run with a user's email and another
  account's email
- **THEN** that user's `manager_user_id` holds the second account's `user_id`

#### Scenario: No route creates a user or changes a password

- **WHEN** the server's route table is inspected
- **THEN** no route creates a user or sets a password
- **AND** the account-administration routes are exactly the five this
  requirement lists

#### Scenario: A user disabled via the new HTTP route cannot log in

- **WHEN** a user is disabled via `POST /admin/users/:id/disable` and then tries
  to log in
- **THEN** `verifyLogin` rejects the try
- **AND** it rejects it exactly as for a user disabled by any other means
- **AND** this matches the pre-existing "A disabled user cannot log in" scenario

#### Scenario: The CLI and the route write the same column

- **WHEN** `PATCH /admin/users/:id/roles` sets a user's roles
- **AND** the CLI or a login then reads that user's roles
- **THEN** the value read is the one the route wrote, from the same column
