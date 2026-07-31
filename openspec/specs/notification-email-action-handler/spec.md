<!-- antislop: allow-file passive-voice long-words synonym-rotation -->
<!-- passive-voice: SHALL-form normative spec prose, the convention every
     capability spec in openspec/specs/ already follows. long-words:
     "attempt" is the outbox's own term (MAX_ATTEMPTS), not a synonym for
     "try". synonym-rotation: "publish error" and "config-validation issue"
     are distinct domain terms carried over from http-action-handler, not
     rotation. See the antislop-targeted-allow-not-file-all memory for why a
     named-rule allow is the correct tool here, not `all`. -->
# notification-email-action-handler

## Purpose

A vendor-neutral `notification.email` action handler, registered by default
against the engine's handler registry. It sends a plain-text email over SMTP
when a process reaches an authored action position. Recipients are a static
address list in the process body. This reaches a team or manager mailbox,
never the actor a step is assigned to.

## Requirements

### Requirement: A notification.email handler is registered by default

The engine SHALL ship a handler registered under action type
`notification.email`, resolvable through the existing handler `Registry`
seam. `startEngine`'s `registry` parameter SHALL default to a registry that
includes this handler. A deployment calling `startEngine()` with no explicit
registry can then author `notification.email` actions without more wiring. A
caller supplying its own explicit `registry` argument stays unaffected.

#### Scenario: startEngine with no explicit registry resolves notification.email

- **WHEN** `startEngine` is called without a `registry` argument
- **THEN** an authored action of type `notification.email` resolves to a
  handler instead of dead-lettering as unregistered

#### Scenario: An explicit registry argument is unaffected

- **WHEN** `startEngine` is called with a caller-supplied `registry` that
  omits `notification.email`
- **THEN** an authored action of that type dead-letters as unregistered,
  exactly as it would have before this change

### Requirement: The handler's config is validated at publish time

The handler SHALL declare a `configSchema` requiring three fields. They are
`to` (an array of at least one valid email address), `subject` (a string),
and `body` (a plain-text string). The existing authoring-time registry
validation SHALL check this schema. A malformed `notification.email` config
is therefore a publish error, never a runtime dead-letter. It covers the same
five action positions the existing registry check already visits.

#### Scenario: A well-formed config passes publish validation

- **WHEN** a process is published with a `notification.email` action whose
  config supplies a valid `to`, `subject`, and `body`
- **THEN** publish validation raises no issue for that action

#### Scenario: A malformed recipient address is rejected at publish

- **WHEN** a process is published with a `notification.email` action whose
  `to` array holds a string that is not a valid email address
- **THEN** publish is rejected with a located config-validation issue, and
  the process is never persisted with that action live

#### Scenario: An empty recipient list is rejected at publish

- **WHEN** a process is published with a `notification.email` action whose
  `to` array is empty
- **THEN** publish is rejected with a located config-validation issue for
  that action

#### Scenario: The handler is authorable at every action position

- **WHEN** a process is published with a valid `notification.email` action at
  each of the five action positions
- **THEN** publish validation raises no issue at any of them

### Requirement: The handler builds its message from static config alone

The handler SHALL build the outgoing message from `action.config` (`to`,
`subject`, `body`) plus the engine-computed headers described below. It SHALL
never read instance `data`. It SHALL never perform a database lookup by
`instanceId`. The `body` SHALL be sent as plain text.

The only transformation the `body` SHALL undergo is line-ending
normalization: a bare newline becomes CRLF, the line ending RFC 5322 defines.
The transfer encoding carries a bare newline through unchanged. Without this
step, some readers render an authored paragraph as one run-on line.

#### Scenario: Message fields arrive at the mail server unchanged

- **WHEN** a `notification.email` action's config specifies a `to`,
  `subject`, and `body`
- **THEN** the delivered message carries those exact recipients, that exact
  subject, and that exact plain-text body
- **AND** no instance data is merged in

#### Scenario: An authored newline reaches the reader as a line break

- **WHEN** a `body` separates two lines with a bare newline
- **THEN** the delivered message separates them with CRLF, and the decoded
  body still reads as two lines

### Requirement: The handler returns a stable structured result

The handler SHALL return an object carrying the `Message-ID` it sent and the
recipient list the server accepted. That object becomes the `result` namespace
an `Action.output` mapping reads, unchanged from the existing handler-result
contract. The shape SHALL stay stable across a retry.

A defined shape matters more here than for a webhook. `evalOutput` throws a
plain error when an `Action.output` entry cannot read `result`. A plain error
is transient. The outbox would then redeliver a message the mail server
already accepted. An undefined return shape therefore duplicates mail.

#### Scenario: An output mapping reads the sent Message-ID

- **WHEN** a `notification.email` action declares an `Action.output` entry
  over `result.messageId`
- **THEN** the entry evaluates against the header the handler sent
- **AND** the delivery writes it back like any other handler result

#### Scenario: An action with no output mapping still succeeds

- **WHEN** a `notification.email` action declares no `Action.output`
- **THEN** the delivery succeeds and writes no field

### Requirement: Every recipient is accepted before the message is sent

The handler SHALL issue one `RCPT TO` per address in `to`. It SHALL check
every reply before it sends `DATA`. A rejected address SHALL abort the
delivery while no message has left the handler. A `5xx` rejection SHALL be
permanent, and a `4xx` rejection SHALL be transient. The handler SHALL never
deliver to part of `to`.

Delivering to the accepted addresses and reporting the rejected ones would
break under at-least-once. A `4xx` rejection is transient, so the outbox
retries the row. Every already-accepted address then receives the message a
second time. Aborting before `DATA` is the only rule under which a retry
cannot duplicate.

#### Scenario: One rejected address sends nothing to anybody

- **WHEN** `to` names three addresses and the server answers `550` to the
  second `RCPT TO`
- **THEN** the handler sends no `DATA`, and the delivery dead-letters as a
  permanent failure

#### Scenario: A temporarily rejected address retries without duplicating

- **WHEN** the server answers `450` to one `RCPT TO` of several
- **THEN** the handler sends no `DATA`, and the delivery retries as transient
- **AND** no address received a message on the aborted attempt

### Requirement: A delivery is final once the server accepts the message

SMTP carries no idempotency contract. `Message-ID` deduplication is
best-effort, and most receiving systems ignore it. A redelivery therefore
sends a second real message. The handler SHALL treat the `250` reply to the
end of `DATA` as the point of no return. After that reply, no later failure
SHALL fail the delivery. That covers a `QUIT` failure, a socket reset, and a
timeout while closing the session.

The handler SHALL construct its returned result before that point. Producing
the result then cannot itself raise after the message is out.

#### Scenario: A failure while closing the session does not resend

- **WHEN** the server answers `250` to the end of `DATA` and the connection
  then breaks before `QUIT` completes
- **THEN** the delivery succeeds, and the outbox never redelivers that row

#### Scenario: A failure before DATA completes does resend

- **WHEN** the connection breaks before the server accepts the message body
- **THEN** the delivery fails as transient, and the outbox retries it

### Requirement: SMTP connection details come from the environment

The handler SHALL read its SMTP endpoint and credentials from the process
environment, never from the process body. The variables are `SMTP_HOST`,
`SMTP_PORT` (defaulting to `587`), `SMTP_USER`, `SMTP_PASSWORD`, and
`SMTP_FROM`. This matches the convention `DATABASE_URL` and
`AUTH_JWT_SECRET` already set. When the environment supplies credentials, the
handler SHALL authenticate over a TLS-protected session, never in the clear.

`SMTP_HOST` and `SMTP_FROM` SHALL both be present. The handler SHALL check
both at dispatch, before it opens a socket. It SHALL NOT invent a sender
address for an unset `SMTP_FROM`. A synthesized sender would fail SPF at a
real relay, which turns a clear configuration error into a `5xx` reply
mid-delivery.

#### Scenario: Delivery targets the configured endpoint

- **WHEN** the handler dispatches a `notification.email` action and
  `SMTP_HOST` names a reachable SMTP endpoint
- **THEN** the handler connects to that host and port, and the message
  arrives there with `SMTP_FROM` as its sender

#### Scenario: Credentials are never sent over an unprotected connection

- **WHEN** `SMTP_USER` and `SMTP_PASSWORD` are set
- **THEN** the handler authenticates only after the session is TLS-protected
- **AND** it fails the delivery rather than authenticating in the clear

### Requirement: Every message carries a deduplication signal

The handler SHALL set a `Message-ID` header derived from
`ctx.idempotencyKey` on every delivery attempt. This includes a retried
delivery of the same outbox row. The value SHALL stay identical across every
attempt of the same delivery. It does not vary with the attempt count. A
cooperating mail system can then dedupe a redelivered message. That fulfils
the handler registry's existing idempotency requirement.

#### Scenario: A message carries the delivery's idempotency key

- **WHEN** the handler sends a message for a `notification.email` action
- **THEN** the message carries a `Message-ID` header derived from
  `ctx.idempotencyKey`

#### Scenario: A retried delivery sends the same Message-ID as the original

- **WHEN** an outbox row is redelivered after a transient failure and the
  handler is invoked again for that row
- **THEN** the `Message-ID` on the retried message is identical to the one
  sent on the first attempt

### Requirement: Failures are classified as permanent or transient

The handler SHALL classify every non-success outcome as either permanent or
transient. Permanent means an immediate dead-letter with no retry. Transient
means the existing outbox retry and backoff, dead-lettering only after
exhausting `MAX_ATTEMPTS`:

- An unset `SMTP_HOST` or `SMTP_FROM` SHALL be permanent. It is a deployment
  misconfiguration, and no retry can repair it.
- An SMTP `5xx` reply SHALL be permanent. An address rejected as unknown or
  malformed will not become valid on the next attempt.
- An SMTP `4xx` reply SHALL be transient.
- A connection failure (refused, reset, or a name-resolution failure) SHALL
  be transient.
- A delivery aborted for exceeding its timeout SHALL be transient.

#### Scenario: An unset SMTP_HOST dead-letters immediately

- **WHEN** the handler dispatches a `notification.email` action while
  `SMTP_HOST` is unset
- **THEN** the delivery fails permanently and the row dead-letters without
  consuming a transient retry attempt

#### Scenario: An unset SMTP_FROM dead-letters before any connection

- **WHEN** the handler dispatches a `notification.email` action while
  `SMTP_HOST` is set and `SMTP_FROM` is unset
- **THEN** the delivery fails permanently without opening a socket
- **AND** the handler sends nothing under a substitute sender address

#### Scenario: A 550 reply is a permanent failure

- **WHEN** the SMTP server answers a recipient command with `550`
- **THEN** the delivery dead-letters immediately, without consuming a
  transient retry attempt

#### Scenario: A 450 reply is a transient failure

- **WHEN** the SMTP server answers with `450`
- **THEN** the delivery is treated as transient and is retried through the
  existing outbox retry and backoff
- **AND** it dead-letters only once its attempts are exhausted

#### Scenario: A refused connection is a transient failure

- **WHEN** nothing is listening on the configured host and port
- **THEN** the delivery is treated as transient

### Requirement: Every delivery is bounded by a timeout

The handler SHALL bound every SMTP session with a timeout. It SHALL use the
action's declared `timeout` when present and an engine-supplied default
otherwise. The default SHALL be a named constant set well below the outbox
claim lease. The handler's own bound then fires before the worker's deadline,
producing a specific abort rather than a generic deadline failure. The
handler SHALL close its socket when the bound fires, so a stalled server
cannot hold the connection open.

#### Scenario: A stalled SMTP session is aborted

- **WHEN** the SMTP server accepts the connection and then never answers
- **THEN** the handler aborts the session after the timeout and closes the
  socket
- **AND** the delivery fails as a transient failure

#### Scenario: A declared timeout wins over the default

- **WHEN** a `notification.email` action declares its own `timeout`
- **THEN** that value bounds the session instead of the default
