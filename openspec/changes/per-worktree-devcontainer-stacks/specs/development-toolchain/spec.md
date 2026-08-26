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
address is the port `worktree-isolation` derives for the checkout. A main
checkout keeps the listening port as its host address.

Where the two numbers differ, the package's own config must carry one
consequence. The browser reaches the dev server on the host address, so the
hot-reload client opens its socket on that number. The package SHALL read that
number from the environment, as `PORT_VITE`. It SHALL NOT assume it equals the
listening port. The devcontainer SHALL carry `PORT_VITE` in the environment of
the container the dev server runs in.

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
- **THEN** the hot-reload client connects to the host address, and a saved
  file reaches the browser with no manual reload

### Requirement: The devcontainer permits every frontend dev origin

The devcontainer's `CORS_ALLOWED_ORIGINS` value SHALL list the
`http://localhost:<port>` origin of every frontend package's dev server. Each
of them can then call the engine's HTTP wrapper from a browser, with no
per-contributor setting change.

It SHALL list the `http://127.0.0.1:<port>` origin of that same dev server too.
The manual checklist mandates that address under Windows. A browser following
it sends an origin the first form does not cover. One browser package therefore
contributes two entries.

In a checkout whose host address differs from the listening port, the
allowlisted origin SHALL carry the host address `worktree-isolation` derives.
The browser reaches the dev server there, so that address is the origin the
request arrives with.

The value MUST use the allowlist form that `configurable-cors-origins` already
specifies, a comma-separated origin list. It MUST NOT use the `*` wildcard.
That wildcard would work today. It is also mutually exclusive with the
credentialed CORS a future cookie-backed `ActorResolver` would need.

A change that alters a package's assigned port SHALL carry the matching
allowlist change. So SHALL one that adds or removes a frontend package.

#### Scenario: Any frontend calls the engine from a browser

- **WHEN** a browser on the assigned dev origin issues a
  cross-origin request to the engine running in the devcontainer
- **THEN** the response carries `Access-Control-Allow-Origin` echoing that
  origin, along with `Vary: Origin`

#### Scenario: An unlisted origin is still refused

<!-- Copied from the base spec, which a MODIFIED delta repeats verbatim. -->
<!-- antislop: allow passive-voice synonym-rotation -->

- **WHEN** a browser on an origin absent from the allowlist issues the same
  request
- **THEN** no `Access-Control-Allow-Origin` header is emitted and the browser
  blocks the response, unchanged from the behavior
  `configurable-cors-origins` specifies

#### Scenario: Adding a frontend package

<!-- Copied from the base spec, which a MODIFIED delta repeats verbatim. -->
<!-- antislop: allow passive-voice synonym-rotation -->

- **WHEN** a frontend workspace package is added
- **THEN** its assigned dev origin is added to `CORS_ALLOWED_ORIGINS` in the
  same change that adds it

#### Scenario: Removing a frontend package

<!-- Copied from the base spec, which a MODIFIED delta repeats verbatim. -->
<!-- antislop: allow passive-voice synonym-rotation -->

- **WHEN** a frontend workspace package is deleted
- **THEN** its origin is removed from `CORS_ALLOWED_ORIGINS` in the same
  change that deletes it

#### Scenario: The allowlist carries a worktree's browser origin

- **WHEN** a checkout whose derived host address differs from the listening
  port brings its stack up
- **THEN** `CORS_ALLOWED_ORIGINS` names that host address, under both
  `localhost` and `127.0.0.1`

### Requirement: The manual checklist states its address and its one conflict

`docs/browser-checks.md` SHALL open with the operating rules a manual run
needs.

It SHALL name `127.0.0.1` as the address, never `localhost`. Under Windows
`localhost` resolves to `::1`, and the connection hangs. The port itself is a
per-machine choice. Git ignores `.devcontainer/docker-compose.override.yml`, so
no number in this file binds every contributor. The checklist SHALL give the
two-line snippet that publishes one, suggesting the mapping
`127.0.0.1:3001:3000`. It
SHALL also say the engine serves the bundle from `WEB_ROOT`.

The bring-up now publishes the ports `worktree-isolation` derives for the
checkout. It writes them into `.devcontainer/docker-compose.ports.yml`, a file
of its own. Compose reads that file beside the contributor's override, where
one exists. The checklist SHALL say so.
It SHALL keep the hand-written snippet for a contributor who wants a binding of
their own. The override file stays theirs.

It SHALL state that a contributor must build the frontend bundle first. The
engine serves `packages/web/dist`, a build output the repository does not
track. It answers every navigation with a JSON 404 when that directory is
absent.

It SHALL state that no `bun test` run may overlap a manual run. The dev
server's outbox poller claims rows the suite drives.

Each entry SHALL state what to open, what to do, and what a pass looks like.
Each entry SHALL name the change that first asked for it.

#### Scenario: A contributor opens an area

- **WHEN** a contributor follows the checklist
- **THEN** the file gives `127.0.0.1`, not `localhost`, and the snippet that
  publishes the contributor's own port

#### Scenario: A reader learns where the port comes from

- **WHEN** a contributor reads the operating rules
- **THEN** the file names the bring-up as what publishes the ports, and names
  the generated ports file

#### Scenario: A manual run needs a build

- **WHEN** a contributor has not run the frontend build
- **THEN** the checklist says to build it first, and names why: the engine
  serves `packages/web/dist`

#### Scenario: A manual run and a test run do not overlap

- **WHEN** a dev server answers the published port
- **THEN** the checklist forbids a `bun test` run until that server stops

#### Scenario: An entry keeps its origin

- **WHEN** a reader asks why an entry exists
- **THEN** the entry names the change that first asked for the check

### Requirement: The devcontainer provides an SMTP catcher

The devcontainer SHALL run an SMTP catcher service alongside the existing
Postgres service. It SHALL come from a pinned off-the-shelf image with no
custom build. The engine service SHALL depend on it and SHALL receive
`SMTP_HOST`, `SMTP_PORT`, and `SMTP_FROM` pointing at it.

The shared compose file SHALL declare no `ports` entry for it. The Postgres
service already follows that rule. The bring-up publishes the catcher's web
interface instead, at the port `worktree-isolation` derives, into
`.devcontainer/docker-compose.ports.yml`. The bring-up generates that file and
git ignores it, so the shared file still carries no team-wide host
binding. A contributor who
wants an extra binding of their own adds it to the gitignored
`docker-compose.override.yml`, on the loopback address.

This gives the `notification.email` handler's end-to-end test a real SMTP
endpoint to send to. It follows the same "real dependency, not a mock"
pattern the DB-backed suites already use against the Postgres service. The
test that sends a message SHALL skip when `SMTP_HOST` is unset, matching the
existing `test.skipIf(!DB)` convention. It SHALL read the delivered message
back over the catcher's own HTTP API, inside the compose network. It
therefore never depends on a host binding.

#### Scenario: The engine can send mail inside the devcontainer

- **WHEN** a contributor starts the devcontainer and runs the test suite
- **THEN** `SMTP_HOST` and `SMTP_PORT` are already set, and the end-to-end
  send test delivers a message to the catcher instead of skipping

#### Scenario: The shared compose file publishes no port for the catcher

- **WHEN** a reader inspects the tracked `docker-compose.yml`
- **THEN** the catcher service declares no `ports` entry, exactly like the
  Postgres service

#### Scenario: A contributor inspects a delivered message

- **WHEN** a contributor opens the catcher's web interface at the address the
  bring-up printed
- **THEN** they read a delivered message there

#### Scenario: A run without SMTP_HOST skips instead of failing

- **WHEN** the test suite runs outside the devcontainer with `SMTP_HOST`
  unset
- **THEN** the end-to-end send test skips, and the config-validation and
  failure-classification tests still run

## ADDED Requirements

### Requirement: The push gate runs against the checkout it pushes

The pre-push hook SHALL run its checks inside the devcontainer that
bind-mounts the checkout the push comes from. A hook reaching another
checkout's container reports on files the push does not carry. Its result then
says nothing about the branch it gates.

The hook SHALL take the container's identity from the derivation
`worktree-isolation` specifies. It SHALL NOT name a Compose project itself.
The same rule holds for every gate the hook runs inside the container.

This refines the container placement "Every push runs the toolchain's checks
against a real database" already mandates. That requirement puts the checks in
a container. This one says which container.

#### Scenario: A worktree's push compiles that worktree

- **WHEN** a developer pushes from a linked worktree carrying a type error the
  main checkout lacks
- **THEN** the gate reports that type error and refuses the push

#### Scenario: Another checkout's state does not reach the gate

- **WHEN** a developer pushes from a linked worktree while another checkout
  carries a type error
- **THEN** the gate does not report the other checkout's type error
