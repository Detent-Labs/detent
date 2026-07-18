## ADDED Requirements

### Requirement: PostgreSQL is the datastore
The engine SHALL persist its state to PostgreSQL. The database connection SHALL be
configured through a `DATABASE_URL` environment variable, and the development
environment SHALL provide a PostgreSQL instance addressed by that variable.

#### Scenario: Development database is available
- **WHEN** the devcontainer is started
- **THEN** a PostgreSQL 16 service is running and `DATABASE_URL` resolves to it

### Requirement: Native Postgres access via Bun.sql
Database access SHALL use Bun's native `Bun.sql`. The project MUST NOT add a
third-party PostgreSQL client library or ORM as a dependency for datastore access.

#### Scenario: No third-party Postgres client is added
- **WHEN** the project's dependencies are inspected
- **THEN** no external PostgreSQL client (e.g. `pg`, `postgres`) is present, and any
  database access is written against `Bun.sql`
