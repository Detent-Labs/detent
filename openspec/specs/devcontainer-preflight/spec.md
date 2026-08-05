# devcontainer-preflight

## Purpose

Names the failing devcontainer precondition before a developer meets its
symptom, and prints the command that repairs it. Splits the checks into a
profile the push gate can run and a profile only the bring-up runs.

## Requirements

### Requirement: The preflight checks preconditions in a fixed order

The preflight SHALL check these preconditions, in this order:

1. the Docker daemon answers
2. every required container runs and reports healthy
3. the HTTP server process carries `AUTH_JWT_SECRET`
4. every published port answers on the host
5. the development database holds its schema and its seed data
6. no stale codebase-memory WAL file holds a lock

The order runs cheapest-first and cause-before-symptom. A down daemon makes
every later check fail, so it reports first.

The preflight SHALL stop at the first blocking failure. A developer repairs
one cause, then re-runs. Reporting six failures that one cause produced hides
which one to repair.

#### Scenario: The daemon is down

- **WHEN** the preflight runs and the Docker daemon does not answer
- **THEN** it reports check 1 as failed, runs no later check, and exits
  non-zero

#### Scenario: Every precondition holds

- **WHEN** the preflight runs against a fully prepared stack
- **THEN** it reports each of the six checks as passed and exits zero

### Requirement: A failed check prints the command that repairs it

Every failing check SHALL print a command the developer can copy and run. The
command SHALL be the literal command, not a description of one.

Some checks name no single repair command. Such a check SHALL print the file
to change, and the line it needs.

#### Scenario: A stopped container

- **WHEN** check 2 fails because the containers are down
- **THEN** the output carries the literal
  `docker compose -f .devcontainer/docker-compose.yml up -d`

#### Scenario: A missing signing secret

- **WHEN** check 3 fails because the server process carries no
  `AUTH_JWT_SECRET`
- **THEN** the output names the command that restarts the server with the
  secret from `.devcontainer/.auth-secret`

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

`ALLOW_INSECURE_DEV_AUTH=1` sits in the tracked compose file on purpose. It
lets the bare container and the test suite start without auth configuration.
The bring-up injects `AUTH_JWT_SECRET` into the HTTP server process alone.

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

### Requirement: Both bring-up scripts carry the same preflight contract

`scripts/dev-up.sh` and `scripts/dev-up.ps1` are two implementations of one
flow. Both SHALL run the same six checks, in the same order, under the same
two profiles. Both SHALL print the same repair commands.

One file SHALL hold those six checks. `scripts/preflight.sh` is that file.
`scripts/preflight.ps1` SHALL delegate to it rather than restate the checks.
The two entry points then agree by construction rather than by hand.

The delegator SHALL pass its profile argument through unchanged. It SHALL
return the exit code it receives. A host with no `bash` SHALL get a message
naming Git Bash and `scripts/dev-up.sh`. The delegator SHALL then exit
non-zero rather than crash.

Both SHALL stay idempotent. A second run against a prepared stack SHALL change
nothing and SHALL pass.

#### Scenario: The two scripts agree

- **WHEN** the same broken precondition faces each script in turn
- **THEN** both name the same check and print the same repair command

#### Scenario: A re-run changes nothing

- **WHEN** either script runs twice against a prepared stack
- **THEN** the second run passes and leaves the stack as it was

#### Scenario: The PowerShell entry point delegates

- **WHEN** a developer runs `pwsh scripts/preflight.ps1 core` or
  `pwsh scripts/preflight.ps1 serve`
- **THEN** it runs `scripts/preflight.sh` with that same profile
- **AND** it exits with the code that script returned

#### Scenario: A host without bash gets a named failure

- **WHEN** the PowerShell entry point runs on a host where `bash` resolves to
  nothing
- **THEN** it prints a message naming Git Bash and `scripts/dev-up.sh`, and
  exits non-zero

### Requirement: Every service declares a healthcheck

Check 2 reports a container as healthy. `docker compose ps` reports a health
state only for a service that declares a healthcheck.

`.devcontainer/docker-compose.yml` SHALL declare a healthcheck for every
service it defines. A service with no meaningful readiness probe SHALL still
declare one that proves its process answers.

#### Scenario: A container that runs but does not answer

- **WHEN** the database container runs, but Postgres inside it does not yet
  accept a connection
- **THEN** check 2 reports it as not healthy, rather than as running
