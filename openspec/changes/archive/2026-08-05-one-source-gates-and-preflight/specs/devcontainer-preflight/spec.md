## MODIFIED Requirements

### Requirement: Both bring-up scripts carry the same preflight contract

`scripts/dev-up.sh` and `scripts/dev-up.ps1` are two implementations of one
flow. Both SHALL run the same six checks, in the same order, under the same
two profiles. Both SHALL print the same repair commands.

One file SHALL hold those six checks. `scripts/preflight.sh` is that file.
`scripts/preflight.ps1` SHALL delegate to it rather than restate the checks.
The two entry points then agree by construction rather than by hand.

The delegator SHALL pass its profile argument through unchanged. It SHALL
return the exit code it receives. A host with no `bash` SHALL get a message
naming Git Bash and `scripts/dev-up.sh`. The delegator SHALL then exit
non-zero rather than crash.

Both SHALL stay idempotent. A second run against a prepared stack SHALL change
nothing and SHALL pass.

#### Scenario: The two scripts agree

- **WHEN** the same broken precondition faces each script in turn
- **THEN** both name the same check and print the same repair command

#### Scenario: A re-run changes nothing

- **WHEN** either script runs twice against a prepared stack
- **THEN** the second run passes and leaves the stack as it was

#### Scenario: The PowerShell entry point delegates

- **WHEN** a developer runs `pwsh scripts/preflight.ps1 core` or
  `pwsh scripts/preflight.ps1 serve`
- **THEN** it runs `scripts/preflight.sh` with that same profile
- **AND** it exits with the code that script returned

#### Scenario: A host without bash gets a named failure

- **WHEN** the PowerShell entry point runs on a host where `bash` resolves to
  nothing
- **THEN** it prints a message naming Git Bash and `scripts/dev-up.sh`, and
  exits non-zero
