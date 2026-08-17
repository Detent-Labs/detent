## ADDED Requirements

### Requirement: The PowerShell bring-up script delegates its flow to the shell script

`scripts/dev-up.sh` and `scripts/dev-up.ps1` are two implementations of one
bring-up flow. That flow brings the compose stack up and installs
dependencies. It creates the JWT secret, seeds the database, creates the
superuser, and starts the server. `scripts/dev-up.sh` SHALL hold that
flow. `scripts/dev-up.ps1` SHALL delegate to it rather than restate it.
This is the same shape the existing preflight-contract requirement
already mandates for `preflight.ps1` over `preflight.sh`.

The delegator SHALL pass its arguments through unchanged. It SHALL return
the exit code it receives. A host with no `bash` SHALL get a message
naming Git Bash. The delegator SHALL then exit non-zero rather than crash.

#### Scenario: The PowerShell entry point delegates for bring-up

- **WHEN** a developer runs `pwsh scripts/dev-up.ps1`
- **THEN** it runs `scripts/dev-up.sh`
- **AND** it exits with the code that script returned

#### Scenario: A host without bash gets a named failure

- **WHEN** `scripts/dev-up.ps1` runs on a host with no `bash` on `PATH`
- **THEN** it prints a message naming Git Bash and exits non-zero without
  running any bring-up step
