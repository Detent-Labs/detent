# Spec Delta

## MODIFIED Requirements

### Requirement: A failed check prints the command that repairs it

Every failing check SHALL print a command the developer can copy and run. The
command SHALL be the literal command, not a description of one.

A command that drives Podman SHALL reach the checkout the preflight ran in.
Each checkout derives its own pod. A command naming a pod or a container
literally reaches a different stack once a developer copies it out of a
linked worktree. A repair command therefore runs through a script that
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
  container, and names no pod or container literally
