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

#### Scenario: A stall during the TLS handshake names the handshake

- **WHEN** the server answers `STARTTLS` with `220` and then sends nothing
- **THEN** the session times out, and the failure message names the TLS handshake
- **AND** no credential reaches the server

### Requirement: The handler reads nothing after STARTTLS until the TLS handshake completes

After the server accepts `STARTTLS`, the handler SHALL discard every byte the plain socket still
holds. It SHALL write and read nothing on the session until the TLS handshake completes. A byte that
arrives before the handshake completes SHALL end the session as a transient failure during the TLS
handshake. A failed handshake SHALL end it the same way. No credential SHALL reach the server in
either case.

#### Scenario: Plain text injected before the handshake ends the session

- **WHEN** the server answers `STARTTLS` with `220`, and then sends plain text before any TLS
  handshake completes
- **THEN** the handler reads none of it as an SMTP reply
- **AND** the delivery fails as transient during the TLS handshake, and no `AUTH` reaches the server
