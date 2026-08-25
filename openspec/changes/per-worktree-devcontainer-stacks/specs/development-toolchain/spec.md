## MODIFIED Requirements

### Requirement: Each frontend package serves on a fixed, distinct dev port

Every workspace package that ships a Vite dev server SHALL pin its own port in
its `vite.config.ts`. It SHALL fail to start rather than fall back to a
different one. The assignment is one port per package. It stays stable across
contributors and machines:

| package | port |
|---|---|
| `packages/web` | 5173 |

Exactly one package ships a dev server, so exactly one port is assigned. The
rule stays stated per package rather than as a single constant. That is what a
second browser package would have to satisfy.

That assignment is the port the dev server listens on inside its container. The
host address it is published on is the assigned port plus the offset
`worktree-isolation` derives for the checkout. A main checkout's offset is
zero, so its host address is the assigned port unchanged.

The two numbers differing has one consequence the package's own config must
carry. The browser reaches the dev server on the published host port, so the
hot-reload client opens its socket back on that number. The package SHALL take
that number from the environment rather than assume it equals the listening
port.

Pinning alone is not enough. Without a strict-port setting, Vite serves on the
next free port when the configured one is taken. That reintroduces the
start-order dependence the fixed assignment exists to remove. A conflict MUST
surface as a startup error a contributor can see and act on.

#### Scenario: Starting one dev server

- **WHEN** a contributor runs `bun run dev` in the frontend package
- **THEN** the dev server listens on its assigned port, and on no other port

#### Scenario: Starting every dev server together

- **WHEN** a contributor starts every frontend dev server, which is now one
- **THEN** every area is reachable under its prefix on that one port, in any
  order
- **AND** no second dev server exists to start, so no start-order dependence
  remains

#### Scenario: An occupied port fails loudly

- **WHEN** the assigned port is already in use by another process
- **THEN** that dev server exits with a port-in-use error instead of binding
  a different port

#### Scenario: Hot reload reaches the published address

- **WHEN** a browser loads the dev server of a worktree whose published host
  port differs from the listening port
- **THEN** the hot-reload client connects to the published host port, and an
  edit reaches the browser without a manual reload

## ADDED Requirements

### Requirement: The push gate runs against the checkout being pushed

The pre-push hook SHALL run its checks inside the devcontainer that
bind-mounts the checkout the push was issued from. A hook that reaches another
checkout's container reports on files the push does not carry, and its result
carries no information about the branch it is gating.

The hook SHALL take the container's identity from the derivation
`worktree-isolation` specifies, rather than naming a Compose project itself.
The same rule holds for every gate the hook runs inside the container.

#### Scenario: A worktree's push compiles that worktree

- **WHEN** a push is issued from a linked worktree carrying a type error that
  the main checkout does not carry
- **THEN** the gate reports that type error and refuses the push

#### Scenario: A worktree's push is unaffected by other checkouts

- **WHEN** a push is issued from a linked worktree while another checkout
  carries a type error
- **THEN** the gate does not report that other checkout's error
