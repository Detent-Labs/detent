# database-seed-script

## Purpose

Defines the `bun run seed` entry point. It populates a database with the
repo's example processes and one demo user per reserved role, idempotently.

## Requirements

### Requirement: An idempotent seed entry point exists.
The project SHALL provide a `bun run seed` script. A run against an
empty, schema-initialized database SHALL populate it with the repo's
example processes. It SHALL also populate one demo user per reserved
role. A second run against an already-seeded database SHALL NOT insert a
duplicate process row or a duplicate user row.

#### Scenario: Seeding an empty database
- **WHEN** a contributor runs `bun run seed` against an empty database
- **THEN** the three `examples/*.json` processes exist as published
  versions, and one demo user exists per reserved role

#### Scenario: Re-running against an already-seeded database
- **WHEN** a contributor runs `bun run seed` twice in a row
- **THEN** the second run reports the same process and user counts as the
  first run, and adds no duplicate row

### Requirement: The script refuses to run without an explicit opt-in.
The seed script SHALL read the `SEED_ALLOW` environment variable. Without
a value, the script SHALL exit non-zero and write nothing to the
database. The demo accounts carry a fixed, published password, and one of
them holds `system:admin`. The person who runs the script therefore names
the target database as a development one.

`add-database-seed-data` accepted a weaker mitigation. The script never
runs on its own. No production deployment path existed then. Roadmap #14
shipped one.

#### Scenario: Running without the opt-in
- **WHEN** a contributor runs `bun run seed` with no `SEED_ALLOW` value
- **THEN** the script exits non-zero, and writes no process version and
  no demo user

### Requirement: Example processes publish in dependency order.
The seed script SHALL publish `examples/subprocess-credit-check-child.json`
before `examples/subprocess-loan-parent.json`. It SHALL reuse the fixed
`processId` (`proc_credit_check`) the parent's pinned subprocess reference
names, so the parent's cross-process validation resolves.

#### Scenario: Publishing the subprocess pair
- **WHEN** the seed script runs against a database with neither process
  published yet
- **THEN** `credit_check` publishes before `loan_application`, and
  `loan_application`'s publish succeeds against the pinned child version

### Requirement: A process seeds under a stable identity across runs.
The seed script SHALL look up an existing process by the seeded
definition's `key` before it publishes. A `key` already present SHALL
reuse that process's existing `processId`. A `key` absent from the
database SHALL mint a new `processId`.

#### Scenario: A second run reuses the same process identity
- **WHEN** the seed script runs a second time with an unchanged example
  body
- **THEN** it publishes under the same `processId` the first run created,
  and `publishBody`'s hash-based no-op leaves no new version row

### Requirement: The script provisions one demo user per reserved role.
The seed script SHALL provision one demo user for each of
`system:publish`, `system:cancel-any`, `system:admin`,
`system:developer`, and `system:reports`. Each demo user's email SHALL
follow one fixed, recognizable convention. A re-run SHALL update an
existing demo user's roles and password. It SHALL NOT create a second
account with the same email.

The set tracks the reserved roles `authorization` defines. Adding a
reserved role SHALL add its demo user alongside it. A contributor can then
reach every role-gated route from a seeded database, without provisioning
an account by hand.

#### Scenario: Provisioning demo users on an empty database
- **WHEN** the seed script runs against a database with no `auth_users`
  rows
- **THEN** five demo users exist afterward, one per reserved role, each
  reachable by its fixed email

#### Scenario: Re-running does not duplicate a demo user
- **WHEN** the seed script runs again after those five users already exist
- **THEN** `auth_users` still contains exactly five demo users, and each
  one's roles and password match the script's current definition

#### Scenario: The reports demo user reaches the reporting routes
- **WHEN** the seeded `system:reports` demo user signs in and calls a
  `/reporting/*` route
- **THEN** the route answers it, without any hand-provisioned account
