## ADDED Requirements

### Requirement: A failed session names the step it failed in

Every transient failure of an SMTP session SHALL name the session step that was running at that
moment. That covers the timeout, a connection the server closes, and the socket's `error` callback. The steps
include the greeting, `EHLO`, `STARTTLS`, the TLS handshake, `AUTH`, `MAIL FROM`, each `RCPT TO`,
`DATA` and the message body. Naming the step SHALL leave the failure's classification as it was.

#### Scenario: A connection closed during the TLS handshake names the handshake

- **WHEN** the server answers `STARTTLS` with `220` and then closes the connection
- **THEN** the delivery fails as transient
- **AND** the failure message names the TLS handshake

#### Scenario: A stall during the TLS handshake names the handshake

- **WHEN** the server answers `STARTTLS` with `220` and then sends nothing
- **THEN** the session times out, and the failure message names the TLS handshake
- **AND** no credential reaches the server
