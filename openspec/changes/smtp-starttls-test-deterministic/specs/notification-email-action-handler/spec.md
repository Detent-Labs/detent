## ADDED Requirements

### Requirement: A session that ends through its wire names its step

A session can end through its wire in three ways. Its timeout fires, the server closes the
connection, or the socket's `error` callback fires. The transient failure SHALL then name the
session step that was running. The steps run from `connect`
through the greeting, `EHLO`, `STARTTLS`, the TLS handshake, `AUTH`, `MAIL FROM`, each `RCPT TO` and
`DATA` to the message body. The failure's classification SHALL stay as it was.

#### Scenario: A connection closed during the TLS handshake names the handshake

- **WHEN** the server answers `STARTTLS` with `220`, and closes the connection when the TLS
  handshake begins
- **THEN** the delivery fails as transient
- **AND** the failure message names the TLS handshake

#### Scenario: Plain text during the TLS handshake names the handshake

- **WHEN** the server answers `STARTTLS` with `220`, and answers the TLS handshake with plain text
- **THEN** the delivery fails as transient
- **AND** the failure message names the TLS handshake

#### Scenario: A stall during the TLS handshake names the handshake

- **WHEN** the server answers `STARTTLS` with `220` and then sends nothing
- **THEN** the session times out, and the failure message names the TLS handshake
- **AND** no credential reaches the server
