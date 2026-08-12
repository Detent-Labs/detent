<!-- antislop: allow-file passive-voice -->
<!-- SHALL-form normative spec prose, the convention every capability spec in
     openspec/specs/ already follows. -->

## Purpose

One codebase serves two deployment shapes. One is today's on-premise install,
with one tenant per database. The other is a shared SaaS process holding many
tenants at once. This capability covers the control plane that lists them. It
also covers how a request finds its own database, and what keeps two tenants
apart.

## ADDED Requirements

### Requirement: A control plane lists the tenants, and holds nothing else

The control plane SHALL hold one table, `tenants`, with `id`, `key`, `name` and
`database_url`. `key` SHALL be unique.

It SHALL hold no instance, no definition, no account and no outbox row. Every
one of those lives in a tenant's own database.

No other table SHALL gain a tenant column, and no query SHALL gain a tenant
filter. Isolation comes from the connection, not from a predicate. A forgotten
predicate is the fault this model exists to make unrepresentable.

#### Scenario: The control plane carries only the tenant list

- **WHEN** an operator inspects the control-plane schema
- **THEN** `tenants` is the only table there

#### Scenario: A duplicate key is refused

- **WHEN** provisioning creates a second tenant with an existing `key`
- **THEN** the write fails and no second row exists

### Requirement: One environment variable turns SaaS mode on

`TENANT_CONTROL_PLANE_URL` SHALL select the mode. Set, the server resolves a
database per request. Unset, the server uses its own `DATABASE_URL` for every
request, which is exactly today's behaviour.

The unset path SHALL stay the default and SHALL need no configuration. An
existing on-premise deployment upgrades without touching its environment.

#### Scenario: An on-premise deployment is unchanged

- **WHEN** the server starts with `TENANT_CONTROL_PLANE_URL` unset
- **THEN** every request runs against the process `DATABASE_URL`
- **AND** no control-plane connection opens

#### Scenario: SaaS mode needs a reachable control plane

- **WHEN** the server starts with `TENANT_CONTROL_PLANE_URL` set to an
  unreachable address
- **THEN** startup fails with a message naming the control plane
- **AND** the server does not begin serving requests

### Requirement: A request resolves its tenant before it reaches a handler

In SaaS mode the dispatcher SHALL resolve a tenant key from the request. It
SHALL look that key up in the control plane. It SHALL then pass the matching
database to the route handler.

A locally-issued token SHALL carry its tenant as a claim. An externally-issued
token SHALL resolve by its `iss`, which stage 7's dispatch already maps.

An unknown tenant key SHALL answer 401, the answer an unverifiable token gets.
A key whose database refuses the connection SHALL answer 503. That is a
deployment fault rather than a caller fault, and the two must not read alike.

#### Scenario: A token's tenant selects its database

- **WHEN** a request carries a token naming tenant `acme`
- **THEN** its handler runs against the database `tenants` records for `acme`

#### Scenario: Two tenants do not see each other's data

- **WHEN** two tenants each hold an instance, and one tenant's actor lists
  instances
- **THEN** the answer carries that tenant's instance alone

#### Scenario: An unknown tenant is refused

- **WHEN** a request carries a token naming a tenant the control plane does not
  list
- **THEN** the request answers 401

#### Scenario: An unreachable tenant database is a deployment fault

- **WHEN** a request names a listed tenant whose database refuses the connection
- **THEN** the request answers 503

### Requirement: A CLI provisions a tenant

Provisioning SHALL be a CLI action, mirroring `src/auth/cli.ts`. It SHALL NOT
be self-service, and no HTTP route SHALL create a tenant.

Provisioning SHALL create the tenant's database, run `initSchema` against it,
and insert the control-plane row. A fault at any step SHALL leave no
half-provisioned tenant that the dispatcher would then resolve.

#### Scenario: Provisioning yields a usable tenant

- **WHEN** an operator provisions tenant `acme`
- **THEN** `acme`'s database carries the full schema
- **AND** a request naming `acme` reaches it

#### Scenario: A failed provisioning leaves nothing resolvable

- **WHEN** provisioning fails after creating the database but before the
  control-plane row lands
- **THEN** no request can resolve that tenant

### Requirement: A worker serves every live tenant, and one bad tenant stops none

The engine's workers SHALL take a source answering which tenant databases are
live now. On-premise that source SHALL answer one entry, the process database,
which is today's behaviour exactly.

Each poll tick SHALL walk that list. A tick SHALL skip a tenant whose database
refuses the connection, and SHALL log one warning naming it. It SHALL continue
for every other tenant.

The worker count SHALL NOT grow with the tenant count. One unreachable tenant
SHALL NOT delay another beyond the connection try it costs.

#### Scenario: On-premise polling is unchanged

- **WHEN** the engine starts with SaaS mode off
- **THEN** its workers poll the process database, as they do today

#### Scenario: A tick serves every tenant

- **WHEN** three tenants each hold a due outbox row
- **THEN** one tick delivers all three

#### Scenario: An unreachable tenant does not stop the others

- **WHEN** one of three tenants refuses its connection during a tick
- **THEN** the other two are still served
- **AND** one warning names the tenant that refused
