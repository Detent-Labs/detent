## ADDED Requirements

### Requirement: A data source that reads the database takes it from the context

A data source needing its own database access SHALL take that handle from the
resolution context. It SHALL NOT take one bound at registry construction.

Every context SHALL carry the handle. It is not optional, unlike the frozen
actor ids beside it. An absent handle has no sane fallback once one process
serves many tenants. It would quietly read whichever database built the
registry.

`db.list` reads the `data_lists` tables. Bound at construction it would offer
one tenant's option values to every tenant. That is the cross-tenant read this
model exists to prevent.

The `static` type reads no database and SHALL ignore the handle.

#### Scenario: A list resolves in the instance's own tenant

- **WHEN** a field in tenant `acme` resolves a `db.list` source
- **THEN** the options come from `acme`'s `data_lists` tables

#### Scenario: One registry serves two tenants

- **WHEN** one registry resolves the same list key for two tenants
- **THEN** each answer carries that tenant's own values

#### Scenario: The static type keeps its behaviour

- **WHEN** a field resolves a `static` source
- **THEN** it answers its configured options, as it does today
