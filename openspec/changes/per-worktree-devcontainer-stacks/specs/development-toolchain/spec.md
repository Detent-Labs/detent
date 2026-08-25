## MODIFIED Requirements

### Requirement: Each frontend package serves on a fixed, distinct dev port

Every workspace package that ships a Vite dev server SHALL pin its own port in
its `vite.config.ts`. It SHALL fail to start rather than fall back to a
different one. Each package takes one port, and that port stays stable across
contributors and machines:

| package | port |
|---|---|
| `packages/web` | 5173 |

Exactly one package ships a dev server, so the table holds one row. The rule
stays per package rather than a single constant. A second browser package
would have to satisfy it too.

That port is the one the dev server listens on inside its container. Its host
address adds the offset `worktree-isolation` derives for the checkout. A main
checkout takes offset zero, so its host address equals the listening port.

Where the two numbers differ, the package's own config must carry one
consequence. The browser reaches the dev server on the host address, so the
hot-reload client opens its socket on that number. The package SHALL read that
number from the environment. It SHALL NOT assume it equals the listening port.

Pinning alone is not enough. Without a strict-port setting, Vite serves on the
next free port whenever another process holds the configured one. That
reintroduces the start-order dependence the fixed assignment removes. A
conflict MUST surface as a startup error a contributor can act on.

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

- **WHEN** a browser loads the dev server of a worktree whose host address
  differs from the listening port
- **THEN** the hot-reload client connects to the host address, and an edit
  reaches the browser with no manual reload

## ADDED Requirements

### Requirement: The push gate runs against the checkout it pushes

The pre-push hook SHALL run its checks inside the devcontainer that
bind-mounts the checkout the push comes from. A hook reaching another
checkout's container reports on files the push does not carry. Its result then
says nothing about the branch it gates.

The hook SHALL take the container's identity from the derivation
`worktree-isolation` specifies. It SHALL NOT name a Compose project itself.
The same rule holds for every gate the hook runs inside the container.

#### Scenario: A worktree's push compiles that worktree

- **WHEN** a developer pushes from a linked worktree carrying a type error the
  main checkout lacks
- **THEN** the gate reports that type error and refuses the push

#### Scenario: Another checkout's state does not reach the gate

- **WHEN** a developer pushes from a linked worktree while another checkout
  carries a type error
- **THEN** the gate does not report the other checkout's type error
