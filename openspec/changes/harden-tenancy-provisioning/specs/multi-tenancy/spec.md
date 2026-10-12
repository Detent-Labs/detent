# Spec Delta

## MODIFIED Requirements

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

## ADDED Requirements

### Requirement: Each configured issuer names a listed tenant in SaaS mode

In SaaS mode every `AUTH_ISSUERS` entry SHALL carry a `tenant`, and the
control plane SHALL list that tenant. Each issuer SHALL appear once. A
violation SHALL fail startup with an error naming the issuer. Outside SaaS
mode the field SHALL have no effect.

#### Scenario: An issuer with no tenant fails startup

- **WHEN** the server starts in SaaS mode with an `AUTH_ISSUERS` entry that has
  no `tenant`
- **THEN** startup fails with an error naming that issuer's `iss`
- **AND** no server listens

#### Scenario: An issuer naming an unlisted tenant fails startup

- **WHEN** the server starts in SaaS mode with an `AUTH_ISSUERS` entry whose
  `tenant` the control plane does not list
- **THEN** startup fails with an error naming the issuer and the tenant

#### Scenario: A repeated issuer fails startup

- **WHEN** the server starts in SaaS mode with two `AUTH_ISSUERS` entries that
  share one `iss`
- **THEN** startup fails with an error naming that issuer's `iss`

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
database as a listed tenant. Credentials and parameters SHALL NOT change that
answer. Provisioning SHALL refuse before it creates a database or builds a
schema. The control plane SHALL also hold `database_url` unique. The unique
index then refuses a second row with the same URL string.

#### Scenario: A second tenant on the same database fails

- **WHEN** tenant `acme` has database `tenant_acme`, and an operator
  provisions tenant `beta` with a URL naming `tenant_acme` on the same host
- **THEN** provisioning fails with an error naming `acme`
- **AND** `beta` is not listed

#### Scenario: Credentials and parameters do not hide the same database

- **WHEN** an operator provisions a tenant with the URL of a listed tenant's
  database but another password and `?sslmode=require`
- **THEN** provisioning fails

#### Scenario: The control plane refuses a duplicate URL

- **WHEN** two writes insert the same `database_url`
- **THEN** the second write fails and one row exists

### Requirement: Provisioning keeps the URL's connection parameters

The admin connection that runs `CREATE DATABASE` SHALL carry every parameter
of the tenant's database URL, `sslmode` included. It SHALL differ from that
URL in the database name alone.

#### Scenario: The admin connection keeps sslmode

- **WHEN** an operator provisions a tenant with the URL
  `postgres://u:p@db/tenant_x?sslmode=require`
- **THEN** the admin connection opens against `postgres://u:p@db/postgres?sslmode=require`
