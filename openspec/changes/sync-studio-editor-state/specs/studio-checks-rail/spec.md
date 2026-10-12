# Spec Delta

## ADDED Requirements

### Requirement: Chaining targets load from one process list per mount

The studio SHALL read the process list once per mount of the process surface. Every `process.start` site SHALL share that read. It SHALL read a version body only for a `processId` that list holds. A `processId` absent from the list SHALL send no request. The studio SHALL NOT remember a failed read of the list or of a body. The next draft change SHALL try again.

#### Scenario: Typing a process id sends one list request

- **WHEN** the author types `proc_credit_check` into a `process.start` action, one character at a time
- **THEN** the studio sends one `GET /processes` in all
- **AND** it reads a version body once, when the typed id matches a listed process

#### Scenario: An id the list lacks reads as not checked

- **WHEN** the typed `processId` matches no listed process
- **THEN** the site reads as not checked
- **AND** the studio sends no request for it

#### Scenario: The studio retries a failed read

- **WHEN** the process list read fails
- **AND** the author changes the draft afterwards
- **THEN** the studio sends the list read again
