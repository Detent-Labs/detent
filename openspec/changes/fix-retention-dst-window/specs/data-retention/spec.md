<!-- antislop: allow-file passive-voice -->
<!-- The scenarios keep the fixed SHALL/WHEN/THEN grammar of the live
     data-retention spec, which carries the same directive for this reason. -->

# Spec Delta

## MODIFIED Requirements

### Requirement: The sweep redacts only eligible completed and cancelled instances

Each sweep tick SHALL select instances whose `status` is `completed` or
`cancelled`, whose `redacted_at` is `NULL`, and whose
`currentStepEnteredAt` is older than `DATA_RETENTION_DAYS` days. It SHALL
call `redactInstance` once per selected instance. A failure redacting one
instance SHALL NOT stop the rest of the batch.

One retention day SHALL measure 24 hours of elapsed time. The cutoff SHALL
sit exactly `DATA_RETENTION_DAYS` times 24 hours before the engine clock's
current instant. A time zone or a daylight-saving change SHALL NOT move it.

`faulted` instances SHALL be excluded from the automatic sweep
regardless of age. An instance inside the retention window SHALL NOT be
selected.

#### Scenario: An eligible completed instance past the window is redacted

- **WHEN** a sweep tick runs and a `completed` instance's
  `currentStepEnteredAt` is older than the configured window
- **THEN** that instance is redacted by the end of the tick

#### Scenario: An instance inside the window is skipped

- **WHEN** a sweep tick runs and a `completed` instance's
  `currentStepEnteredAt` is younger than the configured window
- **THEN** that instance is not redacted by this tick

#### Scenario: A daylight-saving change inside the window moves no boundary

- **WHEN** a sweep tick runs with a 30-day window
- **AND** a daylight-saving change in the session time zone falls inside it
- **AND** one `completed` instance entered its step one minute more than
  30 times 24 hours ago, and another one minute less
- **THEN** the tick redacts the first instance and not the second
- **AND** the same holds for a change that moves the clock forward and one
  that moves it back

#### Scenario: A faulted instance is never swept automatically

- **WHEN** a sweep tick runs and a `faulted` instance is otherwise past
  the configured window
- **THEN** that instance is not redacted by the sweep

#### Scenario: One instance's redaction failure does not block the batch

- **WHEN** a sweep tick selects several eligible instances and
  `redactInstance` fails for one of them
- **THEN** the remaining eligible instances in the batch are still
  redacted
