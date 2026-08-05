## MODIFIED Requirements

<!-- The block below reproduces the wording of the requirement it replaces,
     which archive needs in full. Rewriting the carried-over prose would lose
     the match against openspec/specs/database-seed-script/spec.md. The role
     list, the two counts and one new scenario change. The base spec's list
     and counts were already stale: it names five roles and five users, while
     `DEMO_USERS` in scripts/seed.ts has held six since stage 26 added
     `system:datalists`. This delta corrects both to seven. The directives
     below excuse the carried-over wording, nothing this change wrote. -->

### Requirement: The script provisions one demo user per reserved role.

<!-- antislop: allow sentence-length run-ons passive-voice -->

The seed script SHALL provision one demo user for each of
`system:publish`, `system:cancel-any`, `system:admin`,
`system:developer`, `system:reports`, `system:datalists` and
`system:templates`. Each demo user's email SHALL
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
- **THEN** seven demo users exist afterward, one per reserved role, each
  reachable by its fixed email

#### Scenario: Re-running does not duplicate a demo user
- **WHEN** the seed script runs again after those seven users already exist
- **THEN** `auth_users` still contains exactly seven demo users, and each
  one's roles and password match the script's current definition

#### Scenario: The reports demo user reaches the reporting routes
- **WHEN** the seeded `system:reports` demo user signs in and calls a
  `/reporting/*` route
- **THEN** the route answers it, without any hand-provisioned account

#### Scenario: The template demo user reaches the template routes
- **WHEN** the seeded `system:templates` demo user signs in and calls
  `GET /templates`
- **THEN** the route answers it, without any hand-provisioned account
