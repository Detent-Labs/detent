# Proposal

## Why

One test fails now and then: `an advertised STARTTLS is taken, and no credential precedes it`. It
failed three times in two weeks. One run was local, and two were CI runs, on PR #126 and PR #132.
Each run read "the SMTP server closed the connection" and missed "TLS handshake".

The cause sits in the test's fake SMTP server. It answers `STARTTLS` and then keeps reading the
socket as SMTP lines. The client's TLS ClientHello carries random bytes. When those bytes hold a
CRLF, the fake answers that "line" with `250 ok`. The TLS client then reads plain text and aborts.

A probe ran 400 upgrades against such a server. It saw 5 such lines, and each one ended its session
early. That rate is about 1.25 percent per run.

The analysis also found a gap in the handler itself. Only the session timeout names the step the
session was in. A closed connection names no step, and neither does the `error` callback. A real certificate failure
ends the handshake fast, through the socket's `error` callback. So the message reads "the SMTP
server closed the connection" and says nothing about the upgrade. The test's own comment promises
more.

## What Changes

- The test's fake SMTP server stops reading after it answers `STARTTLS`. A real server hands its
  socket to TLS at that point. The STARTTLS test then stalls on every run, and the timeout fires
  during "TLS handshake".
- The handler names the session step in every wire failure. A closed connection and a socket
  `error` callback read "during <step>", as the timeout already does. Each stays a transient failure.
- A new test closes the connection right after the `STARTTLS` reply. It expects "TLS handshake"
  in the message. It covers the fast path the flaky test hit by chance.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `notification-email-action-handler`: a new requirement says every transient session failure
  names the session step.

## Impact

- `src/handlers/notification-email.ts`: the wire failure messages carry the session step.
- `test/handlers-notification-email.test.ts`: the fake server goes silent after `STARTTLS`. One new
  test covers a close during the TLS handshake.
- The definition contract, the outbox and the failure classification stay as they are.
