<!-- antislop: allow-file passive-voice -->
<!-- Requirement text copied from openspec/specs/development-toolchain/spec.md, which carries the same directive. -->

## MODIFIED Requirements

### Requirement: The devcontainer provides an SMTP catcher

The devcontainer SHALL run an SMTP catcher service alongside the existing
Postgres service. The catcher SHALL come from a pinned off-the-shelf image
with no custom build. The engine service SHALL depend on it and SHALL receive
`SMTP_HOST`, `SMTP_PORT`, and `SMTP_FROM` pointing at it.

The shared compose file SHALL declare no `ports` entry for it. The Postgres
service already follows that rule. The bring-up publishes the catcher's web
interface instead, at the port `worktree-isolation` derives, into
`.devcontainer/docker-compose.ports.yml`. The bring-up generates that file and
git ignores it, so the shared file still has no team-wide host
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
