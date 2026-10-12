<!-- antislop: allow-file passive-voice -->
<!-- SHALL-form normative spec prose, the convention every capability spec in
     openspec/specs/ already follows. -->
# multi-tenancy

## Purpose

One codebase serves two deployment shapes. One is today's on-premise install,
with one tenant per database. The other is a shared SaaS process holding many
tenants at once. This capability covers the control plane that lists them. It
also covers how a request finds its own database, and what keeps two tenants
apart.

## Requirements

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
token SHALL resolve to the tenant that its issuer's `AUTH_ISSUERS` entry
names, and to no other. A claim inside an externally-issued token SHALL NOT
select a tenant. A token from an issuer that `AUTH_ISSUERS` does not list
names no tenant.

A request that carries a Bearer token SHALL take its tenant from that token
alone. The host it arrived on SHALL NOT stand in for a token whose tenant does
not resolve. A request with no Bearer token, the login request, SHALL resolve
its tenant from the first label of its host.

<!-- antislop: allow synonym-rotation -->
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

<!-- antislop: allow passive-voice -->
#### Scenario: An unknown tenant is refused

- **WHEN** a request carries a token naming a tenant the control plane does not
  list
- **THEN** the request answers 401

#### Scenario: An unreachable tenant database is a deployment fault

- **WHEN** a request names a listed tenant whose database refuses the connection
- **THEN** the request answers 503

#### Scenario: An external token resolves to its issuer's tenant

- **WHEN** `AUTH_ISSUERS` lists `https://login.acme.example/` with tenant
  `acme`, and a request carries a valid token from that issuer
- **THEN** its handler runs against the database `tenants` records for `acme`

#### Scenario: Several issuers may serve one tenant

- **WHEN** `AUTH_ISSUERS` lists two issuers that both name tenant `acme`
- **THEN** a valid token from either issuer runs against `acme`'s database

#### Scenario: An external token cannot pick another tenant

- **WHEN** a valid token from the issuer that names `acme` also carries a
  `tenant` claim of `globex`
- **THEN** its handler runs against `acme`'s database, never `globex`'s

#### Scenario: A token from an unknown issuer does not fall back to the host

- **WHEN** a request arrives on the host `acme.example` and carries a token from
  an issuer that `AUTH_ISSUERS` does not list
- **THEN** the request answers 401

#### Scenario: A token ignores the host label

- **WHEN** a request arrives on the host `globex.example` and carries a valid
  token from the issuer that names `acme`
- **THEN** its handler runs against `acme`'s database

#### Scenario: A request with no token resolves by its host

- **WHEN** a login request arrives on the host `acme.example` with no
  `Authorization` header
- **THEN** its handler runs against the database `tenants` records for `acme`

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

Each poll tick SHALL walk that list. It SHALL start one drain for every tenant
whose previous drain by that worker has ended. A worker SHALL run at most eight
tenant drains at once. A tick SHALL skip a tenant whose database refuses the
connection, and SHALL log one warning naming it. It SHALL continue for every
other tenant.

The worker count SHALL NOT grow with the tenant count. One unreachable tenant
SHALL NOT delay another beyond the connection try it costs. While fewer than
eight drains of that worker run, one tenant's long drain SHALL NOT delay
another tenant's drain.

<!-- antislop: allow passive-voice - a MODIFIED block keeps the live scenario name verbatim -->
#### Scenario: On-premise polling is unchanged

- **WHEN** the engine starts with SaaS mode off
- **THEN** its workers poll the process database, as they do today

#### Scenario: A tick serves every tenant

- **WHEN** three tenants each hold a due outbox row
- **THEN** one tick delivers all three

#### Scenario: An unreachable tenant does not stop the others

- **WHEN** one of three tenants refuses its connection during a tick
- **THEN** the other two still get served
- **AND** one warning names the tenant that refused

#### Scenario: A tenant with a long drain does not delay another

- **WHEN** one tenant's outbox drain still runs and a second tenant holds a
  due outbox row
- **THEN** the worker delivers the second tenant's row without waiting for the
  first tenant's drain to end

#### Scenario: A drain still running starts no second drain

- **WHEN** a tenant's outbox drain from an earlier tick still runs at the next
  tick
- **THEN** that worker starts no second drain for that tenant

#### Scenario: More tenants than the bound all get served

- **WHEN** a worker has more than eight live tenants and none is slow
- **THEN** the worker drains every tenant in each tick
- **AND** no more than eight of its drains run at once

### Requirement: Each configured issuer names a listed tenant in SaaS mode

In SaaS mode every `AUTH_ISSUERS` entry SHALL carry a `tenant`, and the
control plane SHALL list that tenant. Each issuer SHALL appear once. A
violation SHALL fail startup with a message naming the issuer. Outside SaaS
mode the field SHALL have no effect.

#### Scenario: An issuer with no tenant fails startup

- **WHEN** the server starts in SaaS mode with an `AUTH_ISSUERS` entry that has
  no `tenant`
- **THEN** startup fails with a message naming that issuer's `iss`
- **AND** no server listens

#### Scenario: An issuer naming an unlisted tenant fails startup

- **WHEN** the server starts in SaaS mode with an `AUTH_ISSUERS` entry whose
  `tenant` the control plane does not list
- **THEN** startup fails with a message naming the issuer and the tenant

#### Scenario: A repeated issuer fails startup

- **WHEN** the server starts in SaaS mode with two `AUTH_ISSUERS` entries that
  share one `iss`
- **THEN** startup fails with a message naming that issuer's `iss`

#### Scenario: On-premise ignores the field

- **WHEN** the server starts with `TENANT_CONTROL_PLANE_URL` unset and an
  `AUTH_ISSUERS` entry that carries a `tenant`
- **THEN** startup succeeds and every request runs against `DATABASE_URL`

### Requirement: A tenant's connection opens once and ends with the server

The server SHALL open one connection pool per tenant, however many requests
and workers reach that tenant at once. A probe that fails SHALL end the pool it
opened. A failed probe SHALL NOT leave a cached entry, so the next call tries
again. Stopping the server SHALL end every tenant pool.

#### Scenario: Concurrent first calls share one pool

- **WHEN** three callers ask for tenant `acme`'s handle before any pool exists
- **THEN** one pool opens and all three receive it

#### Scenario: A refused connection leaves no pool behind

- **WHEN** a listed tenant's database refuses the probe
- **THEN** the pool opened for that probe ends
- **AND** the next call for that tenant opens a new pool

#### Scenario: Stopping the server ends every pool

- **WHEN** the server stops after serving two tenants
- **THEN** both tenant pools end

### Requirement: A tenant database belongs to one tenant

Provisioning SHALL refuse a database URL that names the same host, port and
database as a listed tenant. Credentials and the query string SHALL NOT change that
answer. Provisioning SHALL refuse before it creates a database or builds a
schema. The control plane SHALL also hold `database_url` unique. The unique
index then refuses a second row with the same URL string.

#### Scenario: A second tenant on the same database fails

- **WHEN** tenant `acme` has database `tenant_acme`, and an operator
  provisions tenant `beta` with a URL naming `tenant_acme` on the same host
- **THEN** provisioning fails with a message naming `acme`
- **AND** `beta` is not listed

#### Scenario: Credentials and the query string do not hide the same database

- **WHEN** an operator provisions a tenant with the URL of a listed tenant's
  database but another password and `?sslmode=require`
- **THEN** provisioning fails

#### Scenario: The control plane refuses a duplicate URL

- **WHEN** two writes insert the same `database_url`
- **THEN** the second write fails and one row exists

### Requirement: Provisioning keeps the URL's query string

The admin connection that runs `CREATE DATABASE` SHALL carry the whole query string
of the tenant's database URL, `sslmode` included. It SHALL differ from that
URL in the database name alone.

#### Scenario: The admin connection keeps sslmode

- **WHEN** an operator provisions a tenant with the URL
  `postgres://u:p@db/tenant_x?sslmode=require`
- **THEN** the admin connection opens against `postgres://u:p@db/postgres?sslmode=require`
