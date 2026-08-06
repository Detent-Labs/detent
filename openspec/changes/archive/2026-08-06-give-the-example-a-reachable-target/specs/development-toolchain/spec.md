## ADDED Requirements

### Requirement: The devcontainer runs a webhook sink

The devcontainer compose file SHALL run a service that answers an
`http.request` action. The service SHALL answer every request with `200`. It
SHALL echo a JSON request body back as its own response body. An
`Action.output` expression then reads a value the process definition sent.

The service SHALL run the image the `app` service builds, and a script tracked
in `scripts/`. It SHALL NOT add a third-party image to the stack.

The service SHALL declare a healthcheck, like every other service in that file.
It SHALL declare no `ports` entry, exactly like the Postgres service and the
mail catcher. A contributor who wants to reach it from the host publishes the
port in their own gitignored `docker-compose.override.yml`.

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
- **THEN** it writes the method and the path to stdout, where
  `docker compose logs` shows them

#### Scenario: The shared compose file publishes no port for the sink

- **WHEN** a contributor reads the tracked `docker-compose.yml`
- **THEN** the sink service declares no `ports` entry

### Requirement: Every action type the shipped examples name resolves in the default registry

Every action `type` that a file under `examples/` names SHALL resolve in
`createDefaultRegistry()`. A contributor SHALL reach a terminal step in the
running dev server without registering a handler by hand.

`scripts/seed.ts` and `scripts/demo-expense-approval.ts` SHALL register no
placeholder handler. Their registries publish and drive the same example the
server runs. A placeholder there hides a type the server cannot dispatch.

#### Scenario: The seed script needs no placeholder handler

- **WHEN** `scripts/seed.ts` publishes every file under `examples/` against
  `createDefaultRegistry()` alone
- **THEN** publish-time registry validation passes for all of them

#### Scenario: An example gains an unregistered action type

- **WHEN** a change points an example at an action type
  `createDefaultRegistry()` does not register
- **THEN** the change registers a real handler for it, or picks a type that
  already resolves

## MODIFIED Requirements

### Requirement: The devcontainer permits the shipped example's HTTP target

The devcontainer's `HTTP_ACTION_ALLOWED_HOSTS` value SHALL hold the host of
every `http.request` target the repository's own examples and scripts name.
Today that is one host, `webhook-sink:8080`, the sink service the previous
requirement describes. An entry carries its port whenever the port is not the
scheme default, because `egressRefusal` compares `URL.host`.

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
- **THEN** the `http.request` action's delivery reaches the sink rather than
  dead-lettering on the egress policy

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
