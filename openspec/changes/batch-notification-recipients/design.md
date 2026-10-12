# Design

## Context

`notificationEmailHandler` resolves recipients, then opens one SMTP session
through `runSession`. One deadline races that session. `buildMessage` writes
the `To:` header from the list it receives. `buildMessageId` makes the
`Message-ID` from the idempotency key. `resolveRecipients` reads addresses
from `auth_users` through `emailsForUserIds` and trusts them.

The owner ruled on 2026-10-12. Batches replace a cap, and no event kind is
new. Addresses get validated at write and skipped at send. See proposal.md.

## Goals / Non-Goals

**Goals:**

- A group of any size reaches every enabled member through a relay that
  allows 100 recipients per session.
- One malformed stored address no longer blocks the mail for the others.
- No SMTP command or header takes text from an unchecked address.

**Non-Goals:**

- No recorded event for a dropped address. No new instance-event kind.
- No migration of stored addresses. The send-time filter covers old rows.
- No bound on the list length. A list of N addresses sends ceil(N / 100)
  messages.
- No SMTP connection reuse across batches.
- No new message in the admin Users screen. See the last risk below.

## Decisions

**Batch size is a named constant, `SMTP_MAX_RECIPIENTS_PER_SESSION = 100`.**
RFC 5321 §4.5.3.1.10 requires a server to accept 100 recipients. A smaller
number gains nothing. A larger one fails on a conforming relay. It stays a
constant. No deployment has asked for another value, and a relay below 100
breaks the protocol minimum.

**`runSession` takes one batch.** The handler loops over the batches. The
session code, its phase tracking and its deadline keep their shape. A new
`deliverBatch` owns the `SmtpWire`, the deadline and the `finally` cleanup
that the handler holds now. Alternative: send every batch in one session with
`RSET` between messages. That saves a handshake per batch. It breaks the rule
that one session either delivers or stops, and one stalled session would hold
every batch. Rejected.

**The timeout bounds each session, not the delivery.** The spec already says
"every SMTP session". The outbox deadline, derived from its claim lease,
still bounds the delivery as a whole. A list of several hundred recipients
over a slow relay can reach that deadline. The row then retries and resends
the batches it already delivered. That costs the same as a later batch that
fails.

**`Message-ID` takes a `-<n>` suffix for several batches.**
A list of 100 or fewer keeps today's identifier, so no existing consumer
changes. The suffix is the one-based batch number. A batch keeps its
identifier on every retry.

**`To:` names only the batch's addresses.** A candidate then sees the
members of one batch.

**`result.messageId` is the first batch's `Message-ID`.** `result.recipients`
holds the whole list. The `Action.output` shape stays stable, and an entry
over `result.messageId` keeps working.

**One `emailAddressSchema`, equal to `z.string().email()`.** It lives in
`src/auth/users.ts`. The handler's `to` entries, `createUser`, the route
and the send-time filter all use it. So the write check and the handler
check cannot drift. When the check fails, `createUser` throws a plain `Error`.
The display name bound does the same. `handleAdminCreateUser` checks first and answers
400 through `RequestShapeError`. The CLI already prints the error message and
exits non-zero.

**Dropped addresses log through `log.warn`.** The handler has
`ctx.instanceId` and `ctx.action.id`, and it knows the account id from the
id-to-address map. The warning names those three and never the address text,
which may hold line breaks. The handler writes no event. An event kind
belongs to the definition contract and the `runtime-events` spec, and the
owner declined that.

**An empty filtered list takes the "no recipient" path.**
The delivery succeeds with an empty `recipients` list. It writes the existing
warning.

## Risks / Trade-offs

- A later batch fails after an earlier one went out. The retry sends the
  earlier batches again. Their `Message-ID` values repeat, so a cooperating
  mail system dedupes. SMTP offers nothing better, and the owner accepted
  this cost.
- A long list over a slow relay reaches the outbox deadline. The row retries
  and duplicates the delivered batches. Groups of that size are rare. The
  per-session bound keeps a stalled relay from holding the worker past the
  lease.
- `z.string().email()` is stricter than RFC 5321. It demands a dot in the
  domain. An operator cannot create an account at `admin@localhost` after
  this change. Every seed, test and script address ends in `.test` or `.com`.
- The admin Users screen shows the new `400` as its generic request-shape text.
  Its email input has `type="email"`, which catches most typos first. A
  dedicated message is a UI change with its own cycle, so it waits.
- Accounts with a bad address stay in the table. The send-time filter skips
  them with a warning. An operator fixes them by creating a correct account.

## Migration Plan

No data migration and no schema change. The code ships as one release. A
rollback restores the single-session send and the unchecked write path. No
stored data depends on either.

## Open Questions

None.
