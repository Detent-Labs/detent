# Spec Delta

## REMOVED Requirements

### Requirement: The WAL check warns rather than blocks

**Reason**: Check 6 detects a held codebase-memory WAL lock only where the OS
enforces mandatory file locks, which is Windows. On Linux and macOS locks are
advisory, so the probe always succeeds and the check never warns. The
development host has run Linux since 2026-10-20.

**Migration**: None. Re-running `index_repository` repairs a stale index.
CLAUDE.md's codebase-memory section already names that command.

### Requirement: The preflight checks six preconditions in a fixed order

**Reason**: Its sixth precondition is the WAL check removed above. "The
preflight checks five preconditions in a fixed order" carries the other five
unchanged.

**Migration**: None for callers. Checks 1 to 5 keep their numbers, their order
and their repair commands.

## ADDED Requirements

### Requirement: The preflight checks five preconditions in a fixed order

The preflight SHALL check these preconditions, in this order:

1. Podman answers.
2. Every container of this checkout's pod runs and reports healthy.
3. The HTTP server process carries `AUTH_JWT_SECRET`.
4. Every published port answers on the host.
5. The development database holds its schema and seed data.

The order runs cheapest-first and cause-before-symptom. The preflight SHALL
stop at the first blocking failure.

#### Scenario: Podman does not answer

- **WHEN** the preflight runs and `podman info` fails
- **THEN** it reports check 1 as failed, runs no later check, and exits
  non-zero

#### Scenario: One cause reports once

- **WHEN** the pod is down, so checks 2 to 5 would all fail
- **THEN** the preflight reports check 2 alone and exits non-zero

#### Scenario: Every precondition holds

- **WHEN** the preflight runs against a fully prepared pod
- **THEN** it reports each of the five checks as passed and exits zero

## MODIFIED Requirements

### Requirement: The preflight carries two profiles

The preflight SHALL carry a `core` profile and a `serve` profile.

The `core` profile SHALL cover checks 1 and 2. These are the preconditions
of any work in the container, including a test run.

The `serve` profile SHALL cover the `core` profile plus checks 3, 4 and 5.
These are the preconditions of a browser session against a running server.

The `core` profile SHALL start no long-running process. It SHALL NOT start the
HTTP server, seed the database, or publish a port.

#### Scenario: The core profile leaves no server running

- **WHEN** the `core` profile runs against a stack with no HTTP server
- **THEN** it passes, and no HTTP server runs afterwards

#### Scenario: The serve profile prepares a browser session

- **WHEN** the `serve` profile passes
- **THEN** the server answers on its published port, and the seed data and the
  signing secret are both in place
