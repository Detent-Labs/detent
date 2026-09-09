<!-- antislop: allow-file passive-voice -->
<!-- Requirement text copied from openspec/specs/persistence/spec.md, which carries the same directive. -->

## MODIFIED Requirements

### Requirement: PostgreSQL is the datastore
The engine SHALL persist its state to PostgreSQL. The database connection SHALL be
configured through a `DATABASE_URL` environment variable. The development
environment SHALL provide a PostgreSQL instance addressed by that variable. Until
the project freezes on a version, that instance SHALL track the latest released
PostgreSQL rather than a pinned major. That development instance SHALL keep its
data directory on a named volume, so its contents outlive the container.

#### Scenario: Development database is available
- **WHEN** the devcontainer is started
- **THEN** a PostgreSQL service is running and `DATABASE_URL` resolves to it

#### Scenario: The development database tracks the latest release
- **WHEN** the devcontainer's database image tag is inspected
- **THEN** it names the latest released PostgreSQL rather than a specific major

#### Scenario: Development database contents survive a restart
- **WHEN** the devcontainer stops and starts again
- **THEN** the rows written before the stop are still readable
