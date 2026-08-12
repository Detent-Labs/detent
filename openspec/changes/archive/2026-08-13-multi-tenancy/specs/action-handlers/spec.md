## ADDED Requirements

### Requirement: A handler that reads the database takes it from the invocation

A handler needing its own database access SHALL take that handle from its
invocation context. It SHALL NOT take one a caller bound when building the
registry.

Every context SHALL carry the handle. It is not optional, unlike the frozen
actor ids beside it. An absent handle has no sane fallback once one process
serves many tenants.

One registry then serves every tenant. A handle bound at construction would
send `notification.email`'s address lookup to one tenant's accounts for every
tenant's message.

A handler needing no database SHALL ignore the handle, exactly as it ignores
the frozen actor ids beside it.

#### Scenario: An address lookup reads the right tenant

- **WHEN** a `notification.email` delivery runs for an instance in tenant `acme`
- **THEN** its address lookup reads `acme`'s account directory

#### Scenario: One registry serves every tenant

- **WHEN** a single registry serves two tenants' deliveries
- **THEN** each delivery reads its own tenant's data

#### Scenario: A handler needing no database keeps its behaviour

- **WHEN** the outbox delivers an `http.request` action
- **THEN** it behaves exactly as it did before the handle existed
