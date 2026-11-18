# Proposal

## Why

One test fails now and then: `an advertised STARTTLS is taken, and no credential precedes it`. It
failed three times in two weeks. One run was local, and two were CI runs, on PR #126 and PR #132.
Each run read "the SMTP server closed the connection" and missed "TLS handshake".

The cause sits in the test's fake SMTP server. It answers `STARTTLS` like any other line and then
keeps reading the socket as SMTP text. The client's TLS ClientHello carries random bytes. When those
bytes hold a CRLF, the fake answers that "line" with `250 ok`. The TLS client then reads plain text
and aborts, and the socket closes.

A probe ran 400 upgrades against such a server. It saw 5 such lines, and each one ended its session
early. That rate is about 1.25 percent per run.

The analysis also found a gap in the handler itself. Only the session timeout names the step the
session was in. The flaky runs failed through the wire's `close` callback, whose message names no
step. The wire's `error` callback passes Bun's own text on, with no step either. A real certificate
failure ends the handshake fast through one of these two callbacks. The message then gives no hint
at the upgrade, although the test's own comment promises one.

## What Changes

- The test's fake SMTP server answers `STARTTLS` with `220` and then stops answering. A real server
  does the same once its socket belongs to TLS. The STARTTLS test then stalls on every run, and the
  timeout fires during "TLS handshake".
- The handler names the session step when a session ends through its wire. A closed connection and
  the socket's `error` callback read "during <step>", as the timeout already does. Each stays a
  transient failure.
- The handler marks the TLS handshake before it starts the upgrade, so a failure during the upgrade
  names it.
- Two new tests drive the fast paths on every run. The first fake closes the connection when the
  ClientHello arrives. The second fake answers the ClientHello with plain text. That second test
  turns the old flake into a fixed case.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `notification-email-action-handler`: a new requirement says a session that ends through its wire
  names the session step.

## Impact

- `src/handlers/notification-email.ts`: the wire owns the session step and names it in its failures.
  The TLS handshake step starts before `upgradeTLS`.
- `test/handlers-notification-email.test.ts`: the fake gains a `STARTTLS` branch and two modes for
  the bytes that follow it. Three new tests cover the close path, the plain-text path and the wire's
  two callbacks.
- The definition contract, the outbox and the failure classification stay as they are.
