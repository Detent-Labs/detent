## MODIFIED Requirements

### Requirement: The script provisions one demo user per reserved role.

The seed script SHALL provision one demo user for each of
`system:publish`, `system:cancel-any`, `system:admin`,
`system:developer`, `system:reports`, `system:datalists`,
`system:templates` and `system:author`. Each demo user's email SHALL
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
- **THEN** eight demo users exist afterward, one per reserved role, each
  reachable by its fixed email

#### Scenario: Re-running does not duplicate a demo user
- **WHEN** the seed script runs again after those eight users already exist
- **THEN** `auth_users` still contains exactly eight demo users, and each
  one's roles and password match the script's current definition

#### Scenario: The reports demo user reaches the reporting routes
- **WHEN** the seeded `system:reports` demo user signs in and calls a
  `/reporting/*` route
- **THEN** the route answers it, without any hand-provisioned account

#### Scenario: The template demo user reaches the template routes
- **WHEN** the seeded `system:templates` demo user signs in and calls
  `GET /templates`
- **THEN** the route answers it, without any hand-provisioned account

#### Scenario: The author demo user reaches the draft routes
- **WHEN** the seeded `system:author` demo user signs in and calls
  `GET /drafts`
- **THEN** the route answers it, without any hand-provisioned account
