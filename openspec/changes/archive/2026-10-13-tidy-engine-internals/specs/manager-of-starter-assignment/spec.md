# Spec Delta

## ADDED Requirements

### Requirement: An account has a manager pointer to one other account from its creation

`auth_users` SHALL carry a nullable `manager_user_id` column that references `auth_users.user_id`. It SHALL name at most one other account. It SHALL NOT express a department, a deputy, a matrix, or any second hop. The `CREATE TABLE` of `auth_users` in `initSchema` SHALL declare the column. `initSchema` SHALL NOT add it to a table that exists already.

#### Scenario: The column belongs to the new table

- **WHEN** `initSchema` runs against an empty database
- **THEN** `auth_users` has a `manager_user_id` column, and a new account holds `NULL` in it

### Requirement: An account with no manager stays usable

An account whose `manager_user_id` is `NULL` has no manager on record. That is a valid state and no failure. It SHALL NOT prevent login, listing, or any other account operation.

#### Scenario: An account with no manager is fully usable

- **WHEN** an account whose `manager_user_id` is `NULL` logs in and appears in the list
- **THEN** both succeed, exactly as for an account that existed before this change

### Requirement: A manager pointer cannot dangle

A dangling pointer SHALL be unrepresentable. The column SHALL reference `auth_users.user_id`, so `auth_users` rejects an id that names no account. A cycle between two accounts SHALL stay representable. Nothing traverses the pointer, so a cycle has no effect.

#### Scenario: A manager pointer round-trips

- **WHEN** a caller sets an account's manager to another existing account's `user_id`
- **AND** a caller then reads that account back
- **THEN** the value read is the `user_id` that the caller wrote

#### Scenario: A pointer to no account fails

- **WHEN** a caller sets an account's manager to an id that matches no `auth_users` row
- **THEN** the write fails and that account's manager stays as it was

## REMOVED Requirements

### Requirement: An account carries a manager pointer to one other account

**Reason**: The base text says `initSchema` adds the column to an older table. It no longer does. The renamed requirement "An account has a manager pointer to one other account from its creation" replaces it.

**Migration**: Drop a local database whose `auth_users` lacks `manager_user_id` and seed it again.
