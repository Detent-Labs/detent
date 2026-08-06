## ADDED Requirements

### Requirement: The devcontainer permits the shipped example's HTTP target

The devcontainer's `HTTP_ACTION_ALLOWED_HOSTS` value SHALL hold the host of
every `http.request` target the repository's own examples and scripts name.
Today that is one host, `example.com`, which
`examples/expense-approval.json` targets from its escalation step.

The devcontainer SHALL also set `HTTP_ACTION_ALLOW_INSECURE` to `1`. A local
target runs over plain HTTP, and the `https:` rule would otherwise refuse
every one a contributor starts by hand.

A change that points an example at a new host SHALL add that host here. The
same holds for a script. Without the entry the action still publishes. It
still reaches the outbox. It then dead-letters, so nothing fails until an
operator reads the dead-letter view.

#### Scenario: The shipped example's escalation reaches its target

- **WHEN** the demo script drives `examples/expense-approval.json` to its
  escalation step inside the devcontainer
- **THEN** the `http.request` action's delivery reaches `example.com` rather
  than dead-lettering on the egress policy

#### Scenario: An example gains a new target host

- **WHEN** a change points an example or a script at an `http.request` host
  the list does not name
- **THEN** that host joins `HTTP_ACTION_ALLOWED_HOSTS` in the same commit

#### Scenario: A contributor tests against a local target

- **WHEN** a contributor starts a target on `http://localhost:<port>` and
  points an `http.request` action at it, with that host in the list
- **THEN** the plain-HTTP scheme does not refuse the delivery
