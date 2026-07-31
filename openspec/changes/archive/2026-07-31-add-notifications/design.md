<!-- antislop: allow-file passive-voice -->
<!-- Same SHALL-form technical prose convention the capability specs and the
     approved brainstorm design already use. -->

## Context

See `proposal.md` for motivation, and
`docs/superpowers/specs/2026-07-30-notifications-design.md` for the approved
brainstorm design this change implements. Roadmap #16.

Two existing pieces shape the approach. `src/handlers/http.ts` is the only
handler shipped today. It fixes the file layout and the `HandlerDef` shape.
It also fixes the config-schema discipline and the permanent-vs-transient
split. The
transactional outbox owns retry, backoff, dead-lettering, and the claim
lease. A handler signals its intent by the error it throws: `PermanentError`
dead-letters at once, and any other error retries.

`.devcontainer/docker-compose.yml` already runs one off-the-shelf service
(`postgres:16`) next to the app container. That is the pattern the SMTP
catcher follows.

## Goals / Non-Goals

**Goals:**

- One new handler file, one registration line, and one devcontainer service.
- No new npm dependency. `Bun.connect` speaks TCP, and Bun's socket API
  upgrades a connection to TLS.
- Test coverage that does not need a live mail server for the parts that can
  run anywhere.

**Non-Goals:**

- Everything the approved design's Non-goals section already excludes.
  Recipient resolution from `Step.assignment`, HTML bodies, CEL-templated
  text, attachments, and delivery-status tracking all stay out.
- A general-purpose SMTP library. The handler speaks the subset one message
  needs, and nothing more.

## Decisions

### A hand-written SMTP handler, not a library

`nodemailer` is the obvious alternative. The engine has no npm dependency for
transport anywhere: `http.request` uses `fetch`, and persistence uses
`Bun.sql`. One outbound message needs `EHLO`, `STARTTLS`, `AUTH PLAIN`,
`MAIL FROM`, `RCPT TO`, `DATA`, and `QUIT`. That is roughly 150 lines against
a documented, stable wire protocol. A library would add a dependency, a
version to track, and its own error taxonomy to translate back into
`PermanentError`.

### STARTTLS on the submission port, not implicit TLS

The handler connects in the clear, sends `EHLO`, and upgrades when the server
advertises `STARTTLS`. Implicit TLS (port 465) would need the socket to
negotiate TLS before the first byte. Supporting both doubles the connection
paths for no stated need. Port 587 with STARTTLS is what a corporate relay
and Amazon SES's SMTP interface both accept.

A server that advertises no `STARTTLS` is usable only without credentials.
That is exactly the Mailpit case on port 1025. When `SMTP_USER` is set and
the server offers no `STARTTLS`, the handler throws `PermanentError` instead
of sending the password in the clear. A relay does not start offering TLS on
a retry, so this is permanent, not transient.

### Reply-code classification maps straight onto the outbox

Every SMTP reply starts with a three-digit code. The first digit carries the
class. The handler reads the code of each reply it waits for. A `4xx` throws
a plain `Error`, and a `5xx` throws `PermanentError`. This is a smaller rule
than `http.request`'s, which needs a `429` carve-out from the `4xx` class.
SMTP already separates "try again later" from "never" at the first digit.

### One timeout for the whole session, not per command

`http.request` arms one `AbortController` for the request and the body read.
The SMTP equivalent is one deadline for the session, from connect to `QUIT`.
A per-command timeout would be more precise. It would need a timer per read
for no gain. A stalled server stalls the session, and the delivery fails
either way. `SMTP_DEFAULT_TIMEOUT_MS = 5_000` sits well below the outbox
claim lease. That is `HTTP_DEFAULT_TIMEOUT_MS`'s own placement.

### Header and body encoding

The message is plain ASCII headers plus a `text/plain; charset=utf-8` body,
base64-encoded. Base64 avoids two wire hazards at once. One is the SMTP
dot-stuffing rule for a line starting with `.`. The other is the 998-octet
line limit. An author writing a long paragraph or a leading dot then cannot
corrupt the message. A non-ASCII `subject` is encoded per RFC 2047.

Base64 carries every byte through unchanged. That is why the body's line
endings are normalized to CRLF before encoding. RFC 5322 defines CRLF. An
authored newline would otherwise arrive intact at a reader that renders it as
no break at all. The end-to-end test found this, not review: it sent a
two-line body and read one line back.

### The point of no return is the 250 on end-of-DATA

SMTP carries no idempotency contract. `Message-ID` deduplication is
best-effort, and most receiving systems ignore it. A redelivery is therefore a
second real message. A webhook redelivery does not cost that.

Everything after the `250` on end-of-`DATA` must stop mattering. `QUIT`, the
socket close, and their timeout cannot fail the delivery any more. The
handler also builds its returned result before that point. The result cannot
raise after the message is out.

This closes a hazard the shape of `deliver` creates. It calls
`evalOutput(row.action.output, result)` after the handler returns, and
`evalOutput` throws a plain error when an entry cannot read `result`. A plain
error is transient. Without a defined result shape, a broken output mapping
would resend the message on every retry until `MAX_ATTEMPTS`. Returning
`{ messageId, recipients }` gives an author something stable to map.

### Test placement follows the two-file convention http.request set

`test/handlers-http.test.ts` holds the schema and handler behavior. It starts
a real `Bun.serve` on `port: 0` and needs no `DATABASE_URL`.
`test/definitions.test.ts:318` holds one DB-backed integration test proving
the `configSchema` reaches `publishBody`. The five action positions need no
per-handler test: `test/registry-check.test.ts` already covers them
generically for any registered type.

So this change adds `test/handlers-notification-email.test.ts` and one test in
`test/definitions.test.ts`, and touches `test/registry-check.test.ts` not at
all.

A `Bun.listen` TCP server answering canned replies covers the `4xx` and `5xx`
cases. A connection to a closed port covers the transient connection case. An
unset `SMTP_HOST` needs no socket at all. These run unconditionally, matching
`handlers-http.test.ts`'s own shape. Only the end-to-end send skips without
`SMTP_HOST`.

### The Mailpit web port stays out of the shared compose file

`docker-compose.override.yml` is gitignored, and `devcontainer-exec`'s skill
states the rule plainly: port publishing is a personal convenience, never a
team-wide default. The Postgres service already follows it and publishes
nothing. Mailpit follows it too.

A contributor who wants the web interface adds `127.0.0.1:8025:8025` to their
own override file. The loopback prefix is load-bearing: without it Docker
binds `[::]`, and a browser on a Windows host meets a connection reset. The
end-to-end test never depends on any of this, since it reads messages back
over the compose network.

### Mailpit, read back over its HTTP API

The end-to-end test sends a message and then fetches it back through
Mailpit's `GET /api/v1/messages`. That checks the whole wire path, including
the `Message-ID` the retry contract rests on. A mock socket would only check
that the handler writes what the handler was written to write.

## Risks / Trade-offs

**A strict relay answers differently than Mailpit does.** Mailpit accepts a
permissive subset. A relay may need `AUTH LOGIN` rather than `AUTH PLAIN`.
Mitigation: the error carries the server's own reply text. An operator then
sees which command the server refused. Adding `AUTH LOGIN` stays an additive
follow-up.

**A base64 body is unreadable in a raw SMTP transcript.** Mitigation:
Mailpit's web interface decodes it. The end-to-end test asserts on the
decoded body.

**A permanent classification dead-letters a message an operator wanted
retried.** One example is a `550` reply for a temporary policy block.
Mitigation: the admin area already has a dead-letter requeue action (Roadmap
#10).

**The devcontainer gains a service most work does not need.** It is one small
container. `depends_on` keeps startup ordering explicit. The test skips when
`SMTP_HOST` is unset.

## Migration Plan

No migration. No schema change, no database table, and no HTTP route. An
existing deployment that sets no `SMTP_*` variable and authors no
`notification.email` action behaves exactly as before. Rollback is reverting
the commit.
