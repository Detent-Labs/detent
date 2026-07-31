<!-- antislop: allow-file all -->
<!-- Every requirement in this corpus uses the same fixed SHALL/WHEN/THEN
     Gherkin grammar, established before antislop existed in this repo.
     Rewriting the prose here would touch content from many prior changes
     for a purely stylistic reason, unrelated to any change this file
     documents. -->

## MODIFIED Requirements

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
