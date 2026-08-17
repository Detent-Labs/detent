<!-- antislop: allow-file passive-voice -->
<!-- Every scenario in this file uses the fixed SHALL/WHEN/THEN Gherkin
     grammar the rest of this repo's specs already use (see this
     capability's own main spec.md allow-file passive-voice for the same
     reason). That grammar is structurally passive ("WHEN X is set",
     "THEN Y is redacted"); rewriting it to dodge the rule would break the
     required Scenario format. -->

## MODIFIED Requirements

### Requirement: An automatic sweep is opt-in via DATA_RETENTION_DAYS

`startEngine` (`src/engine/host.ts`) SHALL start the retention sweep's
`pollForever` call only when the `DATA_RETENTION_DAYS` environment
variable is set and parses as a positive integer. It SHALL NOT start
that call when the variable is unset. It SHALL NOT apply a default
retention window.

A `DATA_RETENTION_DAYS` value that is set but does not parse as a
positive integer SHALL cause `startEngine` to throw. It SHALL throw
before any worker starts, and SHALL NOT be treated the same as an
unset variable.

#### Scenario: The sweep does not run without the variable

- **WHEN** the engine starts and `DATA_RETENTION_DAYS` is unset
- **THEN** no retention sweep worker runs, and no instance is redacted
  automatically

#### Scenario: The sweep runs once the variable is set

- **WHEN** the engine starts with `DATA_RETENTION_DAYS` set to a
  positive integer
- **THEN** the retention sweep worker runs on a recurring interval

#### Scenario: An invalid value fails startup instead of silently disabling the sweep

- **WHEN** the engine starts with `DATA_RETENTION_DAYS` set to a value
  that is not a positive integer (for example `"0"`, `"-5"`, or `"abc"`)
- **THEN** `startEngine` throws, no worker starts, and the engine does
  not come up
