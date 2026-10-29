<!-- antislop: allow-file passive-voice -->
<!-- The scenarios keep the fixed SHALL/WHEN/THEN grammar of the live
     data-retention spec, which carries the same directive for this reason. -->

# Spec Delta

## ADDED Requirements

### Requirement: One retention day measures 24 hours of elapsed time

The sweep SHALL read `DATA_RETENTION_DAYS` as a count of 24-hour days. Its
cutoff SHALL sit exactly that many times 24 hours before the engine clock's
current instant. A time zone or a daylight-saving change SHALL NOT move the
cutoff.

#### Scenario: A daylight-saving change inside the window moves no boundary

- **WHEN** a sweep tick runs with a 30-day window
- **AND** a daylight-saving change in the session time zone falls inside it
- **AND** one `completed` instance entered its step one minute more than
  30 times 24 hours ago, and another one minute less
- **THEN** the tick redacts the first instance and not the second
- **AND** the same holds for a change that moves the clock forward and one
  that moves it back
