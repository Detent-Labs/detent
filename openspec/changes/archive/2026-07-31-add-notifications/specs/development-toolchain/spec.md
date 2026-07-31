<!-- antislop: allow-file passive-voice -->
<!-- SHALL-form normative spec prose, the convention this capability's own
     main spec already carries a file-level allow for. -->

## ADDED Requirements

### Requirement: The devcontainer provides an SMTP catcher

The devcontainer SHALL run an SMTP catcher service alongside the existing
Postgres service. It SHALL come from a pinned off-the-shelf image with no
custom build. The engine service SHALL depend on it and SHALL receive
`SMTP_HOST`, `SMTP_PORT`, and `SMTP_FROM` pointing at it.

The shared compose file SHALL publish no host port for it. The Postgres
service already follows that rule: port publishing is a per-machine
convenience in the gitignored `docker-compose.override.yml`, never a
team-wide default. A contributor who wants the catcher's web interface in a
browser SHALL add that binding themselves, on the loopback address.

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

- **WHEN** the tracked `docker-compose.yml` is inspected
- **THEN** the catcher service declares no `ports` entry, exactly like the
  Postgres service

#### Scenario: A contributor inspects a delivered message

- **WHEN** a contributor adds the catcher's web port to their own gitignored
  `docker-compose.override.yml`, bound to `127.0.0.1`
- **THEN** they open that interface in a host browser and read a delivered
  message

#### Scenario: A run without SMTP_HOST skips instead of failing

- **WHEN** the test suite runs outside the devcontainer with `SMTP_HOST`
  unset
- **THEN** the end-to-end send test skips, and the config-validation and
  failure-classification tests still run
