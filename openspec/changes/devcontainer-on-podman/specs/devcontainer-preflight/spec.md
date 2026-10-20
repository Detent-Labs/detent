<!-- antislop: allow-file trailing-negation negation-habit -->
<!-- The MODIFIED requirement "A failed check prints the command that repairs it" copies two phrases from the live spec: ", not a description of one" and "carries no". -->
# Spec Delta

## REMOVED Requirements

### Requirement: The preflight checks preconditions in a fixed order

**Reason**: Its first check and its scenario name the Docker daemon. Podman
runs without a daemon, so the replacement "The preflight checks six
preconditions in a fixed order" asks Podman itself.

**Migration**: None for callers. The six checks keep their numbers, their
order and their profiles.

## ADDED Requirements

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

## MODIFIED Requirements

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
  secret from `.devcontainer/.auth-secret`

#### Scenario: A port that does not answer

- **WHEN** check 4 fails in a linked worktree
- **THEN** the output names the port that checkout publishes
- **AND** it prints the repair command for that checkout

#### Scenario: Missing seed data

- **WHEN** check 5 fails in a linked worktree
- **THEN** the printed seed command execs into that worktree's own `app`
  container, and does not name a pod or a container literally

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
