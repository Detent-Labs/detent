# Spec Delta

## ADDED Requirements

### Requirement: The runbook states how many engine processes a tenant may run

The runbook SHALL state that a tenant may run more than one engine process
against one database.

Some state an engine process keeps only in its own memory. A second process or
a restart can change what such state enforces. The runbook SHALL name every
such piece of state. For each piece it SHALL say what a second process does to it, and
what a restart does to it.

A change that adds such state SHALL add its entry in the same commit. A change
that moves such state into the database SHALL remove its entry there.

The runbook SHALL state that one process finishes startup before a second
process starts. This rule applies to a new database and after an upgrade that
changes the schema. The runbook SHALL say why. The schema step at startup takes no
lock, so two processes that run it together can fail.

#### Scenario: An operator starts three replicas on a new database

- **WHEN** an operator reads the runbook before a first start with three
  processes
- **THEN** the runbook tells them to start one process first
- **AND** to start the other two after the first one reports ready

#### Scenario: An operator plans a second replica

- **WHEN** an operator reads the runbook before starting a second engine
  process for one tenant
- **THEN** the runbook states that a tenant may run more than one process
- **AND** it names the login rate-limit windows as state each process keeps
  on its own
- **AND** it says that each added process raises the effective login
  threshold, and that a restart clears the windows

#### Scenario: The state moves into the database

- **WHEN** a change moves the login rate-limit windows into the database
- **THEN** the same commit removes their entry from the runbook
