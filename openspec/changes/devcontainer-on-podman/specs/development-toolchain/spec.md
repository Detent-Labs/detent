# Spec Delta

## MODIFIED Requirements

### Requirement: The push gate runs against the checkout it pushes

The pre-push hook SHALL run its checks inside the devcontainer that
bind-mounts the checkout the push comes from. A hook reaching another
checkout's container reports on files the push does not carry. Its result then
says nothing about the branch it gates.

The hook SHALL take the container's identity from the derivation
`worktree-isolation` specifies. It SHALL NOT name a pod or a container itself.
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

### Requirement: The manual checklist states its address and its one conflict

`docs/browser-checks.md` SHALL open with the operating rules a manual run
needs.

It SHALL name `127.0.0.1` as the address, never `localhost`. Under Windows
`localhost` resolves to `::1`, and the connection hangs. The port itself is
per checkout. The bring-up publishes the ports `worktree-isolation` derives,
through the Pod spec it generates, and prints them at the end of its run. The
checklist SHALL say so, and SHALL name the generated spec. It SHALL also say
the engine serves the bundle from `WEB_ROOT`.

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
- **THEN** the file gives `127.0.0.1`, not `localhost`, and says the bring-up
  prints the port

#### Scenario: A reader learns where the port comes from

- **WHEN** a contributor reads the operating rules
- **THEN** the file names the bring-up as what publishes the ports, and names
  the generated Pod spec

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

### Requirement: The devcontainer permits the shipped example's HTTP target

The devcontainer's `HTTP_ACTION_ALLOWED_HOSTS` value SHALL hold the host of
every `http.request` target the repository's own examples and scripts name.
Today that is one host, `localhost:8080`, the port the in-container sink
(the sink "The devcontainer pod runs a webhook sink" describes) listens on.
An entry carries its port whenever the port is not the scheme default, because
`egressRefusal` compares `URL.host`.

The list SHALL hold no host that no target names. A stale entry permits egress
to an address nothing in the repository uses.

The devcontainer SHALL also set `HTTP_ACTION_ALLOW_INSECURE` to `1`. The sink
speaks plain HTTP, and the `https:` rule would otherwise refuse it. The same
setting covers a target a contributor starts by hand.

A change that points an example at a new host SHALL add that host here. The
same holds for a script. Without the entry the action still publishes. It
still reaches the outbox. It then dead-letters, so nothing fails until an
operator reads the dead-letter view.

#### Scenario: The shipped example's escalation reaches its target

- **WHEN** the demo script drives `examples/expense-approval.json` to its
  escalation step inside the devcontainer
- **THEN** the `http.request` action's delivery reaches the in-container
  sink rather than dead-lettering on the egress policy

#### Scenario: An example gains a new target host

- **WHEN** a change points an example or a script at an `http.request` host
  the list does not name
- **THEN** that host joins `HTTP_ACTION_ALLOWED_HOSTS` in the same commit

#### Scenario: An example stops naming a host

- **WHEN** a change removes the last `http.request` target naming a host on
  the list
- **THEN** that host leaves `HTTP_ACTION_ALLOWED_HOSTS` in the same commit

#### Scenario: A contributor tests against a local target

- **WHEN** a contributor starts a target on `http://localhost:<port>` and
  points an `http.request` action at it, with that host in the list
- **THEN** the plain-HTTP scheme does not refuse the delivery

#### Scenario: The example's action targets resolve to the in-container sink

- **WHEN** `examples/expense-approval.json`'s `book` and `escalated_review`
  steps' `http.request` actions run inside the devcontainer
- **THEN** each target's host matches the `localhost` port
  `HTTP_ACTION_ALLOWED_HOSTS` names, and the sink running inside the `app`
  container answers it

## REMOVED Requirements

### Requirement: The devcontainer provides an SMTP catcher

**Reason**: It specifies the catcher as a Compose service, with its ports in
`docker-compose.ports.yml` and an override file, and two of its scenarios
read the tracked `docker-compose.yml`. This change retires all three. "The
devcontainer pod provides an SMTP catcher" and "The mail test round-trips
through the catcher" carry its behavior.

**Migration**: The catcher's web interface stays at the derived
`PORT_MAILPIT`. `SMTP_HOST` names `localhost` instead of `mailpit`.

### Requirement: The devcontainer runs a webhook sink

**Reason**: It specifies the sink against Compose: no separate compose
service, an override file for host access, `docker compose logs`, and a
scenario that reads the tracked `docker-compose.yml`. "The devcontainer pod
runs a webhook sink" carries its behavior.

**Migration**: `podman logs` on this checkout's `app` container shows what
the sink received.

## ADDED Requirements

### Requirement: The devcontainer pod provides an SMTP catcher

The devcontainer pod SHALL run an SMTP catcher container beside the Postgres
container. The catcher SHALL come from a pinned off-the-shelf image with no
custom build. The `app` container SHALL receive `SMTP_HOST`, `SMTP_PORT` and
`SMTP_FROM` pointing at it. The containers of one pod share the loopback
address, so `SMTP_HOST` names `localhost`. The generated Pod spec SHALL
publish the catcher's web interface alone, at the derived port, on the
loopback address.

#### Scenario: The engine can send mail inside the devcontainer

- **WHEN** a contributor starts the devcontainer and runs the test suite
- **THEN** `SMTP_HOST` and `SMTP_PORT` are already set, and the end-to-end
  send test delivers a message to the catcher instead of skipping

#### Scenario: The Pod spec publishes the catcher's web interface alone

- **WHEN** a reader inspects the generated Pod spec
- **THEN** the catcher publishes its web interface on the loopback address,
  and no container publishes an SMTP or a Postgres port

#### Scenario: A contributor inspects a delivered message

- **WHEN** a contributor opens the catcher's web interface at the address the
  bring-up printed
- **THEN** they read a delivered message there

### Requirement: The mail test round-trips through the catcher

The `notification.email` handler's end-to-end test SHALL send a real message
to the catcher. It follows the "real dependency, not a mock" pattern the
DB-backed suites use against Postgres. It SHALL skip when `SMTP_HOST` is
unset, matching the `test.skipIf(!DB)` convention. It SHALL read the message
back over the catcher's HTTP API inside the pod, so it never depends on a
host binding.

#### Scenario: A run without SMTP_HOST skips instead of failing

- **WHEN** the test suite runs outside the devcontainer with `SMTP_HOST`
  unset
- **THEN** the end-to-end send test skips, and the config-validation and
  failure-classification tests still run

#### Scenario: The test reads the message inside the pod

- **WHEN** the end-to-end send test runs in the devcontainer
- **THEN** it reads the delivered message from the catcher's API on
  `localhost`, with no host port involved

### Requirement: The devcontainer pod runs a webhook sink

The devcontainer SHALL run a service that answers an `http.request` action
with `200` and echoes a JSON request body back as its response body, so an
`Action.output` expression reads a value the definition sent. The service
SHALL run inside the `app` container as a script tracked in `scripts/`. It
SHALL NOT run as a separate container, add a third-party image, or declare a
probe of its own. The generated Pod spec SHALL publish no host port for it.

#### Scenario: The shipped example books through the sink

- **WHEN** a contributor seeds the devcontainer database and walks
  `examples/expense-approval.json` from capture through review and approval
- **THEN** the `book` step's `http.request` action reaches the sink, the sink
  echoes the authored booking status, and `Action.output` writes it into
  `booking_status`
- **AND** the instance leaves `book` over its `booked` path and reaches a
  terminal step

#### Scenario: The escalation webhook reaches a target that answers

- **WHEN** an `expense_approval` instance enters `escalated_review`
- **THEN** the `http.request` action on that step's `onEntry` receives a `200`
  and the outbox row succeeds

#### Scenario: A contributor reads what the sink received

- **WHEN** the sink answers a request
- **THEN** it writes the method and the path to stdout, where `podman logs`
  on this checkout's `app` container shows them

#### Scenario: The Pod spec publishes no port for the sink

- **WHEN** a contributor reads the generated Pod spec
- **THEN** it declares no separate sink container, and the `app` container
  publishes no host port for the sink it runs internally
