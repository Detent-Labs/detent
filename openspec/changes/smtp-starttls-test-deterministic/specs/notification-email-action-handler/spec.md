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

After the server accepts `STARTTLS`, the handler SHALL discard every reply it still holds from the
plain connection. No byte SHALL reach its SMTP reply reader until the TLS handshake completes, and
it SHALL write nothing before then. Only bytes the TLS session decrypts SHALL count as replies. A
failed handshake SHALL end the session as a transient failure during the TLS handshake. A rejected
certificate counts as a failed handshake.

#### Scenario: Plain text injected before the handshake ends the session

- **WHEN** the server answers `STARTTLS` with `220`, and then sends plain text instead of a TLS
  handshake
- **THEN** the handler reads none of it as an SMTP reply
- **AND** the delivery fails as transient during the TLS handshake, and no `AUTH` reaches the server

#### Scenario: A trusted handshake carries the session on

- **WHEN** the server completes a TLS handshake with a certificate the handler trusts
- **THEN** the handler sends its second `EHLO` inside the TLS session and reads the reply from it

#### Scenario: An untrusted certificate ends the session

- **WHEN** the server presents a certificate the handler does not trust
- **THEN** the delivery fails as transient during the TLS handshake, and no `AUTH` reaches the server

### Requirement: The handler reads STARTTLS from the EHLO extension lines alone

The handler SHALL take a server's `STARTTLS` offer from the `EHLO` reply's extension lines alone.
Those are the lines after the first. A line offers it when its first word equals `STARTTLS`,
ignoring case. The first line names the server, and a name that holds the word SHALL offer nothing.

#### Scenario: A server named after STARTTLS offers nothing

- **WHEN** the `EHLO` reply's first line holds "starttls" in the server's name, and no extension
  line offers `STARTTLS`
- **THEN** the handler sends no `STARTTLS` and goes on without the upgrade
