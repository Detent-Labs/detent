## MODIFIED Requirements

### Requirement: A gate that needs no container runs on the host

A gate that needs only git and a shell SHALL run on the host. It runs before the
hook starts the container checks. A gate that needs Bun SHALL run inside the
devcontainer, through the `docker compose exec` the hook already uses.

A container gate SHALL reach the Compose project the derivation
`worktree-isolation` specifies, and SHALL NOT name one itself.

Host placement buys two things. A contributor with a stopped container still gets
those findings. The checks that cost milliseconds run before the ones that cost
minutes.

A gate SHALL NOT fall back to the host when it needs the container. The push-gate
requirement in `development-toolchain` already forbids that fallback, for the
typecheck and the suite, for this reason.

#### Scenario: A stopped container still reports the host gates

- **WHEN** a contributor pushes while the devcontainer is down
- **THEN** the host gates run and report their findings
- **AND** the preflight then refuses the push for the container checks

#### Scenario: A container gate does not degrade to the host

- **WHEN** a gate needs Bun and the container is unavailable
- **THEN** the push stops
- **AND** that gate does not run against a host Bun

#### Scenario: A container gate reaches the pushing checkout

- **WHEN** a container gate runs from a linked worktree
- **THEN** it execs into that worktree's Compose project, not another
  checkout's
