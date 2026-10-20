# devcontainer-preflight

## Purpose

Names the failing devcontainer precondition before a developer meets its
symptom, and prints the command that repairs it. Splits the checks into a
profile the push gate can run and a profile only the bring-up runs.

## Requirements

### Requirement: A failed check prints the command that repairs it

Every failing check SHALL print a command the developer can copy and run. The
command SHALL be the literal command, not a description of one.

A command that drives Podman SHALL reach the checkout the preflight ran in.
Each checkout derives its own pod. A command can name a pod or a container
by a fixed name. Such a command reaches a different stack once a developer
copies it out of a linked worktree. A repair command therefore runs through a script that
sources the derivation.

Some checks name no single repair command. Such a check SHALL print the file
to change, and the line it needs.

#### Scenario: A stopped container

- **WHEN** check 2 fails because the pod is down
- **THEN** the output carries a literal bring-up command that publishes this
  checkout's ports

#### Scenario: A missing signing secret

- **WHEN** check 3 fails because the server process carries no
  `AUTH_JWT_SECRET`
- **THEN** the output names the command that restarts the server with the
  secret from `container/.auth-secret`

#### Scenario: A port that does not answer

- **WHEN** check 4 fails in a linked worktree
- **THEN** the output names the port that checkout publishes
- **AND** it prints the repair command for that checkout

#### Scenario: Missing seed data

- **WHEN** check 5 fails in a linked worktree
- **THEN** the printed seed command execs into that worktree's own `app`
  container
- **AND** the command takes the container's name from the derivation, never
  from a fixed name

### Requirement: The preflight carries two profiles

The preflight SHALL carry a `core` profile and a `serve` profile.

The `core` profile SHALL cover checks 1, 2 and 6. These are the preconditions
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

### Requirement: The signing-secret check reads the server process

`ALLOW_INSECURE_DEV_AUTH=1` sits in the generated Pod spec on purpose. It lets
the bare container and the test suite start without auth configuration. The
bring-up injects `AUTH_JWT_SECRET` into the HTTP server process alone.

Check 3 SHALL therefore read the environment of the running server process. It
SHALL NOT fail because the container environment carries
`ALLOW_INSECURE_DEV_AUTH`.

#### Scenario: The container variable alone does not fail the check

- **WHEN** check 3 runs against a server process that carries
  `AUTH_JWT_SECRET`, inside a container that also sets
  `ALLOW_INSECURE_DEV_AUTH=1`
- **THEN** the check passes

#### Scenario: A server started without the secret fails the check

- **WHEN** the HTTP server runs without `AUTH_JWT_SECRET`, so it registers no
  `/auth/login` route
- **THEN** check 3 fails and names the restart command

### Requirement: The WAL check warns rather than blocks

The codebase-memory index is per-machine local state. It sits outside the
repository, under a path that carries the username. It drives no engine
behavior and no test.

Check 6 SHALL print a warning and SHALL NOT fail the preflight. It SHALL
resolve the path at run time rather than carry a hardcoded one. A missing
index directory SHALL pass, not fail.

Check 6 SHALL warn only for a WAL file that carries content. A WAL file of
zero length SHALL pass without a warning and without a lock probe. That holds
whether or not a process holds the database open.

A zero-length WAL means the writer checkpointed it. No unrecovered write is
pending, which is the opposite of the stale WAL this check looks for. The
tooling that reads the index runs beside the preflight on a developer machine.
A held lock alone therefore does not tell a live reader from a dead one.

#### Scenario: A locked WAL file that carries content

- **WHEN** check 6 finds a WAL file of non-zero length that another process
  holds
- **THEN** the preflight warns, names the command that clears the lock, and
  still exits zero on that check alone

#### Scenario: A zero-length WAL file held by a live process

- **WHEN** check 6 finds a WAL file of zero length whose database another
  process holds open
- **THEN** the check passes without a warning

#### Scenario: No index on this machine

- **WHEN** check 6 finds no codebase-memory directory
- **THEN** the check passes without a warning

### Requirement: Every service declares a healthcheck

Check 2 reports a container as healthy. Podman reports a health state only for
a container that declares a probe.

The generated Pod spec SHALL declare a liveness probe for every container it
defines. A container with no meaningful readiness probe SHALL still declare
one that proves its process answers.

The database probe SHALL connect over TCP to the loopback address. On a fresh
volume, Postgres first runs an init server that listens on its Unix socket
alone. A probe over the socket reports that server as ready, and the init
server stops a moment later.

Podman restarts a container whose liveness probe fails past its threshold.
Each probe's threshold SHALL therefore cover a first-boot database init.

#### Scenario: A container that runs but does not answer

- **WHEN** the database container runs, but Postgres inside it does not yet
  accept a TCP connection
- **THEN** check 2 reports it as not healthy, rather than as running

#### Scenario: The init server does not pass the probe

- **WHEN** Postgres runs its first-boot init server on a fresh volume
- **THEN** the database probe fails, and passes only once the final server
  accepts a TCP connection

### Requirement: The preflight checks six preconditions in a fixed order

The preflight SHALL check these preconditions, in this order:

1. Podman answers.
2. Every container of this checkout's pod runs and reports healthy.
3. The HTTP server process carries `AUTH_JWT_SECRET`.
4. Every published port answers on the host.
5. The development database holds its schema and seed data.
6. No stale codebase-memory WAL file holds a lock.

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
- **THEN** it reports each of the six checks as passed and exits zero

### Requirement: The bring-up waits for the database before it seeds

The bring-up SHALL wait until the database probe passes before it runs any
step that connects to the database. Those steps are the seed and the
superuser setup. The wait SHALL have a bound. When the bound expires, the
bring-up SHALL fail, name the database container, and print the command that
shows its log.

#### Scenario: A first bring-up on a fresh volume

- **WHEN** a developer runs the bring-up in a checkout whose database volume
  does not exist yet
- **THEN** the seed runs after Postgres finishes its init, and the bring-up
  passes on the first run

#### Scenario: A database that never comes up

- **WHEN** the database probe does not pass within the bound
- **THEN** the bring-up exits non-zero, names the database container, and
  prints the command that shows its log

### Requirement: The bring-up and the preflight stay idempotent

`scripts/preflight.sh` SHALL hold every preflight check, and
`scripts/dev-up.sh` SHALL hold the bring-up flow. Both SHALL stay idempotent.
A second run against a prepared stack SHALL change nothing and SHALL pass.

#### Scenario: A re-run changes nothing

- **WHEN** either script runs twice against a prepared stack
- **THEN** the second run passes and leaves the stack as it was
