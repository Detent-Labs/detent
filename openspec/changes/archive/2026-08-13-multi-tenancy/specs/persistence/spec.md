<!-- antislop: allow-file passive-voice -->
<!-- The base spec carries this same directive, for the same reason: SHALL-form
     normative spec prose. -->

## ADDED Requirements

### Requirement: Each tenant database carries the whole schema

`initSchema` SHALL run against each tenant's database, unchanged in content.
Every tenant therefore holds every table this engine uses.

The control-plane schema SHALL stay separate, and `initSchema` SHALL NOT create
`tenants` in a tenant's database. A tenant that could list its siblings is the
leak this model exists to prevent.

Schema changes SHALL reach every tenant database. A tenant provisioned before a
change gains it the next time `initSchema` runs there. That makes the
idempotent `ADD COLUMN IF NOT EXISTS` convention load-bearing here, rather than
merely tidy.

#### Scenario: A provisioned tenant holds the full schema

- **WHEN** an operator provisions a tenant
- **THEN** that database carries every table `initSchema` creates

#### Scenario: A tenant cannot see the tenant list

- **WHEN** a tenant's database is inspected
- **THEN** it holds no `tenants` table

#### Scenario: An older tenant gains a later column

- **WHEN** `initSchema` runs against a tenant provisioned before a column landed
- **THEN** that database gains the column, and its existing rows survive
