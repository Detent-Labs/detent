## ADDED Requirements

### Requirement: The HTTP server shuts down gracefully on SIGTERM or SIGINT

When the process started via `import.meta.main` receives SIGTERM or SIGINT,
the server SHALL run an orderly shutdown. It SHALL NOT exit at once. It
SHALL stop accepting new HTTP connections and let in-flight requests
finish. It SHALL then stop the engine's background pollers, close the
database connection pool, and exit with code 0. A second SIGTERM or SIGINT
received while shutdown is already in progress SHALL NOT start a second
shutdown sequence.

#### Scenario: SIGTERM triggers an orderly shutdown
- **WHEN** the running server process receives SIGTERM
- **THEN** it stops accepting new HTTP connections and lets in-flight
  requests complete
- **AND** it then stops the engine's background pollers and closes the
  database pool
- **AND** it exits with code 0

#### Scenario: SIGINT follows the same shutdown sequence
- **WHEN** the running server process receives SIGINT
- **THEN** it follows the same shutdown sequence as SIGTERM

#### Scenario: A repeated signal during shutdown starts no second sequence
- **WHEN** a second SIGTERM or SIGINT arrives while shutdown is already in
  progress
- **THEN** the server ignores it and continues the shutdown already running
