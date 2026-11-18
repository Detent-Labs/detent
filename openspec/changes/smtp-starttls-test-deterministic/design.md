# Design

## Context

`test/handlers-notification-email.test.ts:369-385` tests the STARTTLS decision. Its fake server
(`fakeSmtp`, `:149-220`) splits every byte stream on CRLF and answers each "line". The handler
sends `STARTTLS`, gets `220` and calls `upgradeTLS` (`src/handlers/notification-email.ts:297`). The
TLS client then sends a ClientHello, and the fake reads it as SMTP text.

When the ClientHello's random bytes hold a CRLF, the fake answers `250 ok`. The TLS client aborts,
and the socket closes. The wire's `close` callback (`:135`) rejects with "the SMTP server closed the
connection". That message names no session step, so the test's `toContain("TLS handshake")`
(`:380`) fails.

A probe ran 400 upgrades against a CRLF-splitting server in the dev container. It saw 5 lines after
`STARTTLS`, and exactly those 5 sessions closed early. The other 395 stalled until the probe's own
timeout.

Only the timeout names the step today (`:371`). It reads the `phase` object that `runSession`
updates (`:281-339`). The wire's `close` callback (`:135`) and its `error` callback (`:134`) ignore
that object.

## Goals / Non-Goals

Goals:

- The STARTTLS test passes or fails on the handler's behavior alone, never on random bytes.
- Every transient wire failure names the session step.

Non-goals:

- The fake server speaks no TLS. The test checks the handler's decision, and a real handshake adds
  nothing to that.
- The split between permanent and transient failures stays as it is.
- The timeout's own message stays as it is.

## Decisions

### D1. The fake server goes silent after it answers STARTTLS

`fakeSmtp` gains a flag on each connection. The fake sets it right after it writes the `STARTTLS`
reply. From then on, `data` drops every byte and answers nothing. A real server hands the socket to
its TLS layer at that point, and the fake now stops reading there too. The STARTTLS test then stalls
on every run. The one-second action timeout fires during "TLS handshake".

Every fake answers `STARTTLS` this way, so the flag does not need an option. No test reads SMTP lines after
the upgrade.

### D2. The wire carries the session step into its failures

`SmtpWire` takes the `phase` object that `deliverBatch` already builds (`:365`). Its `close`
callback rejects with "notification.email: the SMTP server closed the connection during <step>".

Its `error` callback wraps the socket's own failure. The message reads "notification.email: the SMTP
connection failed during <step>: <cause>". Both stay plain `Error`s, so the outbox treats them as
transient, as before.

`runSession` keeps updating the same object. The wire reads the step at the moment of failure.
`deliverBatch` now builds the `phase` object before the wire.

### D3. A test for the fast path

A new fake option, `closeAfterStartTls`, closes the socket after the `220` reply to `STARTTLS`. The
new test runs the handler against it. The handler must fail as transient, with "TLS handshake" in
the message. No `AUTH` may reach the fake. That covers the path the flaky test hit by chance, and it
covers it on every run.

## Risks / Trade-offs

- A test that asserts the full text of a close message would break. A search of `test/` finds none.
  The existing assertions use `toContain` on a fragment that stays.
- The wrapped message now carries the socket's own text after a colon. Bun writes that text, and it
  has no secret. The credential never reaches it.

## Migration Plan

None. The handler stores nothing, and the messages serve diagnosis alone.

## Open Questions

None.
