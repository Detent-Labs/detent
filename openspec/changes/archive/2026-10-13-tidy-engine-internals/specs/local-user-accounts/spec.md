# Spec Delta

## ADDED Requirements

### Requirement: Local users are persisted in an auth_users table from its creation

The engine SHALL create an `auth_users` table in `initSchema`
(`src/engine/store.ts`), beside the other tables:

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

#### Scenario: initSchema creates the table with a unique email

- **WHEN** `initSchema` runs against an empty database
- **THEN** `auth_users` exists with a unique constraint on `email`

#### Scenario: A second account cannot reuse an email

- **WHEN** someone creates a second user with an email that `auth_users` already holds
- **THEN** the creation fails and no second row exists afterward

### Requirement: An account's id is the actor id

`Actor.id` SHALL equal `user_id`. `assignment.candidates`, `assignment.claimedBy` and `startedBy` SHALL carry that same value. The table SHALL stay additive: an installation that never sets an auth environment variable never touches it.

#### Scenario: A local account acts under its user id

- **WHEN** a local account logs in and starts an instance
- **THEN** the actor's id and the instance's `startedBy` both equal the account's `user_id`

### Requirement: auth_users declares its optional columns at creation

The `CREATE TABLE` SHALL declare `manager_user_id`, `display_name` and `locale`. `initSchema` SHALL NOT add them to a table that exists already. The `manager-of-starter-assignment` capability defines `manager_user_id`. The `account-self-service` capability defines `locale`. A user's display name resolves as "A user's display name resolves to a non-empty value" states.

#### Scenario: A new table has the manager, display-name and locale columns

- **WHEN** `initSchema` runs against an empty database
- **THEN** `auth_users` has `manager_user_id`, `display_name` and `locale`

#### Scenario: A table that lacks those columns stays as it is

- **WHEN** `initSchema` runs against a database whose `auth_users` has none of those three columns
- **THEN** the table still has none of them

## REMOVED Requirements

### Requirement: Local users are persisted in an auth_users table

**Reason**: The base text says `initSchema` adds `manager_user_id`, `display_name` and `locale` to an older table. It no longer does. The renamed requirement "Local users are persisted in an auth_users table from its creation" replaces it.

**Migration**: Drop a local database whose `auth_users` lacks those columns and seed it again.
