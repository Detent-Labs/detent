## ADDED Requirements

### Requirement: Login resolves which tenant to authenticate against

`POST /auth/login` is the one request holding no token yet, so it SHALL resolve
its tenant from the request host.

The login SHALL verify the password against that tenant's own `auth_users`, and
SHALL mint that tenant into the token it issues.

A host naming no listed tenant SHALL answer the way an unknown email answers.
The two SHALL stay indistinguishable, so a caller cannot enumerate tenants by
probing hosts.

With SaaS mode off the login SHALL disregard the host. It SHALL run against
the process database, as it does today.

#### Scenario: The host picks the directory

- **WHEN** a login arrives on `acme`'s host
- **THEN** the password verifies against `acme`'s `auth_users`

#### Scenario: An unknown host is indistinguishable from a wrong password

- **WHEN** a login arrives on a host naming no listed tenant
- **THEN** the answer matches the answer a wrong password gets
- **AND** it costs the same work

#### Scenario: A single-tenant login ignores the host

- **WHEN** the server runs with SaaS mode off
- **THEN** a login on any host authenticates against the process database
