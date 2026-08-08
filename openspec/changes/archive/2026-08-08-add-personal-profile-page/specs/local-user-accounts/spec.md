## MODIFIED Requirements

<!-- antislop: allow passive-voice -->
### Requirement: Local users are persisted in an auth_users table

The engine creates an `auth_users` table in `initSchema`
(`src/engine/store.ts`), alongside the other tables:

```sql
auth_users (
  user_id         text primary key,
  email           text unique not null,
  password_hash   text not null,
  roles           text[] not null default '{}',
  disabled        boolean not null default false,
  manager_user_id text references auth_users(user_id) on delete set null,
  display_name    text,
  locale          text
)
```

`Actor.id` SHALL equal `user_id`. `assignment.candidates`,
`assignment.claimedBy` and `startedBy` SHALL carry that same value. The
table SHALL stay additive: an installation that never sets an auth
environment variable never touches it.

A migration SHALL add `manager_user_id`, `display_name` and `locale` to an
already-created table, since `CREATE TABLE IF NOT EXISTS` skips a table that
exists already. That migration SHALL leave `NULL` in all three columns on
every pre-existing row. The `manager-of-starter-assignment` capability
defines what `manager_user_id` means. This capability defines what
`display_name` means and how it resolves (see "A user's display name
resolves to a non-empty value"). The `account-self-service` capability
defines what `locale` means and how a caller sets it.

#### Scenario: initSchema creates the table

- **WHEN** `initSchema` runs against an empty database
- **THEN** `auth_users` exists with a unique constraint on `email`

#### Scenario: Email stays unique

- **WHEN** someone creates a second user with an email already stored in
  `auth_users`
- **THEN** the creation fails and no second row exists afterward

#### Scenario: An existing database gains the manager and display-name columns

- **WHEN** `initSchema` runs against a database whose `auth_users`
  predates the `manager_user_id` and `display_name` columns
- **THEN** the table has `manager_user_id` and `display_name`, and every
  pre-existing row holds `NULL` in both

#### Scenario: An existing database gains the locale column

- **WHEN** `initSchema` runs against a database whose `auth_users`
  predates the `locale` column
- **THEN** the table has `locale`, and every pre-existing row holds `NULL`
  in it
