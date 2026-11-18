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

- `fakeSmtp` speaks no TLS. The STARTTLS test checks the handler's decision, and a real handshake
  adds nothing to that. D5 covers the real handshake with a separate TLS server.
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

Apply found a real gap here (owner ruling 2026-11-18). The handler hands one `handlers` object to
`Bun.connect` and to `upgradeTLS`. After the upgrade, the raw TCP socket keeps calling that `data`
callback with the bytes on the wire. A live probe on Bun 1.4.4 showed the raw socket delivering
`250 not tls`, the ServerHello, and after a handshake the session ticket.

Before this change the wire read all of it as SMTP replies. So `250 not tls` became the reply to the second `EHLO`, and the
handler went on to `AUTH`. That is the STARTTLS response injection class.

The handler closes it in three places:

- When `STARTTLS` gets its `2xx`, the wire drops every reply it still holds from the plain socket.
  RFC 3207 asks the client to discard what it learned before the upgrade.
- The wire's `data` callback reads only the socket it has attached. After the upgrade that is the
  TLS socket, so raw bytes, plain or encrypted, never reach the reply reader. The TLS layer reads
  them itself.
- The TLS socket's `handshake` callback resolves a promise. `runSession` awaits it before it writes
  the second `EHLO`. A failed handshake ends the session, and so does a rejected certificate. The
  message reads "notification.email: the TLS handshake failed during TLS handshake: <cause>".

Each of these failures stays a plain `Error`, so it stays transient. In the `"plaintext"` fake mode,
the TLS layer reads `250 not tls` as a broken record and fails the handshake. The session then fails
during "TLS handshake", and no `AUTH` reaches the fake.

A test drives a real handshake. The upgrade sequence moves into a function that takes extra TLS
options, which `runSession` never passes. The test passes a test CA, so a committed test
certificate for `127.0.0.1` completes the handshake. Without the CA, the same certificate fails it.

### D6. STARTTLS comes from the extension lines alone

Apply found a second gap. The handler tests the whole `EHLO` reply with `/\bSTARTTLS\b/i`
(`src/handlers/notification-email.ts:353` at `0521ea96`). The reply's first line carries the server's own name. A
server whose name holds "starttls" therefore reads as one that offers `STARTTLS`. This worktree's
pod carries such a name. Mailpit repeats it, and the real-message test failed there with
`502 STARTTLS rejected`.

The handler now reads the extension lines alone, every line after the first. It takes each line's
first word and compares it to `STARTTLS`, ignoring case. RFC 5321 §4.1.1.1 places the keywords
there.

## Risks / Trade-offs

- A test that asserts the full text of a close message would break. A search of `test/` finds none.
  The existing assertions use `toContain` on a fragment that stays.
- The `error` message now carries the socket's own text after a colon. The credential cannot be in
  it, since `AUTH` never runs before the upgrade completes.

## Migration Plan

None. The handler stores nothing, and the messages serve diagnosis alone.

## Open Questions

None.
