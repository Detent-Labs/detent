## ADDED Requirements

### Requirement: A locally-issued token names its tenant

A token this engine issues SHALL carry a `tenant` claim holding the key of the
tenant whose database authenticated the account.

`LOCAL_ISSUER` SHALL stay one constant. Every deployment issues under the same
issuer, so the issuer cannot name a tenant and the claim must.

An externally-issued token SHALL carry no such claim. Its `iss` names its
tenant, which the existing issuer dispatch already maps.

A token whose `tenant` claim names no listed tenant SHALL fail the same way an
unverifiable token fails.

#### Scenario: A local token carries the tenant that authenticated it

- **WHEN** an account in tenant `acme` logs in
- **THEN** its token carries `tenant` set to `acme`

#### Scenario: An external token resolves by issuer

- **WHEN** a token arrives from a configured external issuer
- **THEN** its tenant comes from that issuer's mapping, and the claim is absent

#### Scenario: A single-tenant deployment ignores the claim

- **WHEN** the server runs with SaaS mode off
- **THEN** a token verifies whether or not it carries the claim

### Requirement: The account-liveness check takes its database per call

The resolver's account-liveness callback SHALL take the database as an argument
of the call, not of the resolver's construction.

An actor's liveness is a fact of that actor's own tenant. A callback bound to
one database at construction would check the wrong directory for every tenant
but one.

#### Scenario: The check reads the actor's own tenant

- **WHEN** an actor from tenant `acme` presents a locally-issued token
- **THEN** the liveness check reads `acme`'s account directory

#### Scenario: A disabled account still ends its session
- **WHEN** an operator disables an account whose token has not expired
- **THEN** the server refuses that account's next request
