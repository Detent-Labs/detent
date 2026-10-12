# Spec Delta

## MODIFIED Requirements

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
