## ADDED Requirements

### Requirement: A refused host reaches the dead-letter list, and the message names it

The egress allowlist refuses a host an `http.request` action targets. That
dispatch SHALL reach the dead-letter list, and its message SHALL name the
refused host.

An operator who cannot read the host cannot repair the allowlist. The admin
area reads that list through `listOutbox`. The whole path runs server-side, so
the suite SHALL assert it end to end.

#### Scenario: A refused dispatch dead-letters

- **WHEN** an `http.request` action targets a host the allowlist refuses
- **THEN** the outbox row lands in the dead-letter status
- **AND** `listOutbox` returns it under a dead-letter filter

#### Scenario: The message names the host

- **WHEN** an operator reads that row
- **THEN** its message carries the refused host

#### Scenario: A permitted host does not dead-letter

- **WHEN** an `http.request` action targets a host the allowlist permits
- **THEN** the row does not reach the dead-letter list on that account
