# Spec Delta

## ADDED Requirements

### Requirement: A 401 from any reporting request ends the session

Every reporting screen that calls the API SHALL hand a `401` answer to the shell's session-expiry path. The screen SHALL NOT show the answer as an error message. This holds for the process picker, the three views, the saved-report list, and every request of the report builder.

#### Scenario: A view answers 401

- **WHEN** a process owner's token has expired
- **AND** the cycle-time view requests its data and receives `401`
- **THEN** the shell ends the session and shows the login screen
- **AND** the stored token is gone

#### Scenario: The builder answers 401

- **WHEN** the report builder saves a report and receives `401`
- **THEN** the shell ends the session and shows the login screen

#### Scenario: Another status stays an error message

- **WHEN** a reporting request answers `500`
- **THEN** the screen shows its error note
- **AND** the session stays open
