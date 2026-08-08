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

This requirement assumes `add-user-display-name` has already landed and
added `display_name`. This change adds `locale` on top of it.

`Actor.id` SHALL equal `user_id`. `assignment.candidates`,
`assignment.claimedBy` and `startedBy` SHALL carry that same value. The
table SHALL stay additive: an installation that never sets an auth
environment variable never touches it.

A migration SHALL add `locale` to an already-created table. Earlier
migrations added `manager_user_id` and `display_name` the same way, since
`CREATE TABLE IF NOT EXISTS` skips a table that already exists. That
migration SHALL leave `NULL` in `locale` on every pre-existing row. The
`account-self-service` capability defines what `locale` means and how a
caller sets it.

#### Scenario: initSchema creates the table

- **WHEN** `initSchema` runs against an empty database
- **THEN** `auth_users` exists with a unique constraint on `email`

#### Scenario: Email stays unique

- **WHEN** someone creates a second user with an email already stored in
  `auth_users`
- **THEN** the creation fails and no second row exists afterward

#### Scenario: An existing database gains the locale column

- **WHEN** `initSchema` runs against a database whose `auth_users` predates
  this change
- **THEN** the table has `locale`, and every pre-existing row holds `NULL`
  in it
