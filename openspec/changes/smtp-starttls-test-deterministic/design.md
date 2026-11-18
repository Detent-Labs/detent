# Design

## Context

`test/handlers-notification-email.test.ts:364-384` tests the STARTTLS decision. Its fake server
(`fakeSmtp`, `:149-220`) splits every byte stream on CRLF and answers each "line". It has no
`STARTTLS` branch, so it answers that command with its default `250 ok` (`:213`). The handler takes
any 2xx (`requireOk`, `src/handlers/notification-email.ts:111`) and calls `upgradeTLS` (`:297`). The
TLS client then sends a ClientHello, and the fake reads it as SMTP text.

When the ClientHello's random bytes hold a CRLF, the fake answers `250 ok`. The TLS client aborts,
and the socket closes. The wire's `close` callback (`:135`) rejects with "the SMTP server closed the
connection". That message names no session step, so the test's `toContain("TLS handshake")`
(`:380`) fails.

A probe ran 400 upgrades against a CRLF-splitting server in the dev container. It saw 5 lines after
`STARTTLS`, and exactly those 5 sessions closed early. The other 395 stalled until the probe's own
timeout.

Only the timeout names the step today (`:371`). It reads the `phase` object that `runSession`
updates (`:275-348`). The wire's `close` callback (`:135`) ignores that object. Its `error`
callback (`:134`) passes Bun's own failure on unchanged.

## Goals / Non-Goals

Goals:

- The STARTTLS test passes or fails on the handler's behavior alone, never on random bytes.
- A session that ends through its wire names the session step.

Non-goals:

- The fake server speaks no TLS. The test checks the handler's decision, and a real handshake adds
  nothing to that.
- A `4xx` reply keeps its own message, which already names the refused command (`:113`). A refused
  connection and the lease stop keep theirs too.
- The split between permanent and transient failures stays as it is.

## Decisions

### D1. The fake server answers STARTTLS and then owns the bytes that follow

`fakeSmtp` gains a `STARTTLS` branch. It writes `replyFor("STARTTLS", "220 ready to start TLS\r\n")`
and marks the connection as upgraded. From then on, `data` never reads SMTP lines again. It counts
the bytes it receives in `bytesAfterStartTls`, and a new option, `afterStartTls`, picks what it does.

- `"silent"`, the default, answers nothing. The STARTTLS test then stalls on every run, and the
  one-second action timeout fires during "TLS handshake".
- `"close"` ends the socket when the first bytes after `STARTTLS` arrive.
- `"plaintext"` answers those first bytes with `250 not tls\r\n`, the old flake on every run.

Both active modes wait for the ClientHello. The handler has started the upgrade by then, so the
step reads "TLS handshake" before the failure.

### D2. The wire owns the session step

`SmtpWire` gains a `phase` field, `{ current: "connect" }`. `runSession` writes `wire.phase.current`
where it writes `phase.current` today, and the timeout in `deliverBatch` reads the same field.
`runSession` then takes no `phase` argument.

The `close` callback rejects with "notification.email: the SMTP server closed the connection during
<step>". The `error` callback rejects with "notification.email: the SMTP connection failed during
<step>: <cause>". It passes the socket's failure on as `cause`. Both stay plain `Error`s, so the
outbox treats them as transient, as before.

The wire builds each message when the callback fires. The first failure wins (`fail`, `:186-187`),
so the step it names is the step at that moment.

### D3. The TLS handshake step starts before the upgrade

`runSession` sets the step to "TLS handshake" right before it calls `upgradeTLS`. Today it sets it
after (`:297-302`). A failure that fires while `upgradeTLS` runs, or that `upgradeTLS` throws, then
names the handshake. A throw from `upgradeTLS` rejects `runSession` as before and stays transient.

### D4. Tests

- The existing STARTTLS test keeps its assertions and adds one: the fake's `bytesAfterStartTls` is
  above 0. The handler did start a handshake, and the fake answered none of it.
- A new test runs the fake in `"close"` mode. It expects a transient failure, "TLS handshake" in the
  message and no `AUTH`.
- A new test runs the fake in `"plaintext"` mode with the same three expectations.
- A new test drives `SmtpWire` directly. It sets a step on a fresh wire and fires the `close`
  callback. A second fresh wire fires the `error` callback. The test reads each rejection: the step,
  the cause and a plain `Error`. The class gains an export for that test.

### D5. The handler reads nothing after STARTTLS until the handshake completes

Apply found a real gap here (owner ruling 2026-11-18). After `upgradeTLS`, Bun hands plain bytes
from the server to the upgraded socket's `data` callback before the TLS handshake completes. The
handler then reads `250 not tls` as the reply to its second `EHLO` and goes on to `AUTH`. That is the
STARTTLS response injection class: a party in the middle answers before encryption starts.

The handler closes it in three places:

- When `STARTTLS` gets its `2xx`, the wire drops every byte it still holds from the plain socket.
  RFC 3207 asks the client to discard what it learned before the upgrade.
- The upgraded socket's `handshake` callback resolves a promise. `runSession` awaits it before it
  writes the second `EHLO`. A failed handshake ends the session, and so does a rejected certificate.
  The message reads "notification.email: the TLS handshake failed during TLS handshake: <cause>".
- Any byte that reaches the upgraded socket's `data` callback before the handshake completes ends
  the session. The message reads "notification.email: the server sent data before the TLS handshake
  completed during TLS handshake".

Each of these failures stays a plain `Error`, so it stays transient. The `"plaintext"` fake mode
then fails during "TLS handshake", and no `AUTH` reaches the fake.

## Risks / Trade-offs

- A test that asserts the full text of a close message would break. A search of `test/` finds none.
  The existing assertions use `toContain` on a fragment that stays.
- The `error` message now carries the socket's own text after a colon. The credential cannot be in
  it, since `AUTH` never runs before the upgrade completes.

## Migration Plan

None. The handler stores nothing, and the messages serve diagnosis alone.

## Open Questions

None.
