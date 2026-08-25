## MODIFIED Requirements

### Requirement: A failed check prints the command that repairs it

Every failing check SHALL print a command the developer can copy and run. The
command SHALL be the literal command, not a description of one.

A command that drives Docker SHALL be the one that reaches the checkout the
preflight ran in. A checkout derives its own Compose project, so a command
naming the compose file alone reaches a different stack when it is copied out
of a linked worktree.

Some checks name no single repair command. Such a check SHALL print the file
to change, and the line it needs.

#### Scenario: A stopped container

- **WHEN** check 2 fails because the containers are down
- **THEN** the output carries a literal bring-up command that starts the
  containers of the checkout the preflight ran in

#### Scenario: A missing signing secret

- **WHEN** check 3 fails because the server process carries no
  `AUTH_JWT_SECRET`
- **THEN** the output names the command that restarts the server with the
  secret from `.devcontainer/.auth-secret`

#### Scenario: A port that does not answer

- **WHEN** check 4 fails in a linked worktree
- **THEN** the output names the port that checkout publishes, not the port
  the main checkout publishes
