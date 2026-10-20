# Spec Delta

## REMOVED Requirements

### Requirement: Both bring-up scripts carry the same preflight contract

**Reason**: It binds `scripts/preflight.ps1` and `scripts/dev-up.ps1` to the
shell scripts. This change deletes both PowerShell entry points with Windows host
support. Its idempotency rule carries over unchanged into "The bring-up and
the preflight stay idempotent".

**Migration**: Run `bash scripts/dev-up.sh` and
`bash scripts/preflight.sh <core|serve>` directly.

### Requirement: The PowerShell bring-up script delegates its flow to the shell script

**Reason**: This change deletes `scripts/dev-up.ps1` with Windows host support.

**Migration**: Run `bash scripts/dev-up.sh` directly.

## ADDED Requirements

### Requirement: The bring-up and the preflight stay idempotent

`scripts/preflight.sh` SHALL hold every preflight check, and
`scripts/dev-up.sh` SHALL hold the bring-up flow. Both SHALL stay idempotent.
A second run against a prepared stack SHALL change nothing and SHALL pass.

#### Scenario: A re-run changes nothing

- **WHEN** either script runs twice against a prepared stack
- **THEN** the second run passes and leaves the stack as it was
