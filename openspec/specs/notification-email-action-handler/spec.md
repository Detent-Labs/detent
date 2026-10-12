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

The handler SHALL declare a `configSchema` over four fields:

- `to`, an array of valid email addresses, empty by default
- `toActors`, an array over the fixed tokens `candidate`, `claimant` and
  `starter`, empty by default
- `subject`, a string
- `body`, a plain-text string

The schema SHALL carry one rule across the two recipient lists: `to` and
`toActors` SHALL NOT both be empty. An action naming no recipient at all is an
authoring error, and publish is where it must surface.

The existing authoring-time registry validation SHALL check this schema. A
malformed `notification.email` config is therefore a publish error, never a
runtime dead-letter. It covers the same five action positions the existing
registry check already visits.

Every body published before this change carries a non-empty `to`, so every one
of them still passes.

#### Scenario: A well-formed literal config passes publish validation

- **WHEN** a process is published with a `notification.email` action whose
  config supplies a valid `to`, `subject`, and `body`
- **THEN** publish validation raises no issue for that action

#### Scenario: A config naming only actor recipients passes publish validation

- **WHEN** a process is published with a `notification.email` action whose
  config supplies `toActors: ["candidate"]`, a `subject` and a `body`, and no
  `to`
- **THEN** publish validation raises no issue for that action

#### Scenario: A malformed recipient address is rejected at publish

- **WHEN** a process is published with a `notification.email` action whose
  `to` array holds a string that is not a valid email address
- **THEN** publish is rejected with a located config-validation issue, and
  the process is never persisted with that action live

#### Scenario: An unknown actor token is rejected at publish

- **WHEN** a process is published with a `notification.email` action whose
  `toActors` array holds a token outside `candidate`, `claimant` and `starter`
- **THEN** publish is rejected with a located config-validation issue for
  that action

#### Scenario: Two empty recipient lists are rejected at publish

- **WHEN** a process is published with a `notification.email` action whose
  `to` and `toActors` are both empty or both absent
- **THEN** publish is rejected with a located config-validation issue for
  that action

#### Scenario: The handler is authorable at every action position

- **WHEN** a process is published with a valid `notification.email` action at
  each of the five action positions
- **THEN** publish validation raises no issue at any of them

### Requirement: The handler builds its message from static config alone

The handler SHALL build the outgoing message from `action.config` (`subject`
and `body`) plus the engine-computed headers described below. The recipient
list is the one part it resolves rather than copies. The requirement "The
handler resolves actor tokens to addresses" below defines that step.

It SHALL never read instance `data`. It SHALL never look the instance up by
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

The handler SHALL send one `RCPT TO` per address in the batch it sends. It
SHALL check every reply before it sends `DATA`. A rejected address SHALL stop
that batch while no message of that batch has left the handler. A `5xx`
rejection SHALL be permanent, and a `4xx` rejection SHALL be transient. The
handler SHALL never deliver to part of a batch.

Delivering to the accepted addresses and reporting the rejected ones would
break under at-least-once. A `4xx` rejection is transient, so the outbox
retries the row. Every already-accepted address then receives the message a
second time. Stopping before `DATA` is the only rule under which a retry
cannot duplicate. "A long recipient list sends in batches" defines the batch.

#### Scenario: One rejected address sends nothing to anybody

- **WHEN** the resolved list names three addresses and the server answers
  `550` to the second `RCPT TO`
- **THEN** the handler sends no `DATA`, and the delivery dead-letters as a
  permanent failure

#### Scenario: A temporarily rejected address retries without duplicating

- **WHEN** the server answers `450` to one `RCPT TO` of several
- **THEN** the handler sends no `DATA`, and the delivery retries as transient
- **AND** no address of the rejected batch received a message on the first try

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

### Requirement: The handler resolves actor tokens to addresses

The handler SHALL read the actor ids the engine froze onto the outbox row. It
SHALL map each configured token onto them. `candidate` SHALL name every id in
the step's assignment candidate list. `claimant` SHALL name the id holding the
claim, when one holds it. `starter` SHALL name the id that started the
instance.

The handler SHALL then look each id up in the account store and take that
account's address. An id matching no account contributes no address. A
disabled account contributes no address either. A disabled account is one
nobody may act under, so a message to it reaches nobody who can answer.

Every candidate SHALL receive the message. They are all eligible to do the
work. Sending to one and not the others would need a selection rule this
engine does not have.

The resolved list SHALL hold each address once. Order SHALL be the `to`
entries first, in their authored order, then the addresses the tokens
resolved, in candidate order.

The handler SHALL take the actor ids from the row rather than reading the
instance at delivery time. The resolution worker drives automatic cascades
without waiting for the outbox. An instance may therefore sit two steps on by
the time a row drains. A delivery-time read would then notify the wrong
people.

#### Scenario: A step with one candidate reaches that candidate

- **WHEN** an action configured with `toActors: ["candidate"]` is delivered
  for a step whose assignment resolved to one candidate holding an account
- **THEN** the delivered message names that account's address, and no other

#### Scenario: A step with several candidates reaches all of them

- **WHEN** an action configured with `toActors: ["candidate"]` is delivered
  for a step whose assignment resolved to three candidates, each holding an
  account
- **THEN** the delivered message names all three addresses

#### Scenario: A literal address and a resolved address deduplicate

- **WHEN** an action configures `to` with an address, and `toActors` resolves
  an account carrying that same address
- **THEN** the delivered message names that address once

#### Scenario: A disabled account contributes no address

- **WHEN** `toActors` resolves two candidate ids, and one of them holds a
  disabled account
- **THEN** the delivered message names the enabled account's address alone

#### Scenario: An actor id with no account contributes no address

- **WHEN** `toActors` resolves a candidate id that matches no row in the
  account store
- **THEN** that id contributes no address, and the delivery is not failed by
  it

#### Scenario: The claimant token reaches the actor holding the claim

- **WHEN** an action configured with `toActors: ["claimant"]` is delivered for
  a row enqueued while one actor held the claim
- **THEN** the delivered message names that actor's address

#### Scenario: The starter token reaches the actor that started the instance

- **WHEN** an action configured with `toActors: ["starter"]` is delivered
- **THEN** the delivered message names the address of the account that started
  the instance
### Requirement: A delivery that resolves no recipient sends nothing and succeeds

WHEN the resolved recipient list is empty, the handler SHALL open no SMTP
session. It SHALL return a result whose `recipients` is the empty list. The
delivery SHALL count as succeeded.

A step that resolved to no candidate already records an `assignment.unresolved`
event. A dead-letter here would report that same fact a second time. It would
also park a row an operator then has to discard by hand.

The handler SHALL write one warning line naming the instance and the action.
The condition therefore stays visible without that chore.

#### Scenario: No candidate resolves, so nothing is sent

- **WHEN** an action configured with `toActors: ["candidate"]` and no `to` is
  delivered for a step whose assignment resolved to no candidate
- **THEN** the handler opens no connection to the mail server
- **AND** the delivery succeeds with an empty `recipients` list
- **AND** one warning line names the instance and the action

#### Scenario: A row carrying no frozen actor ids sends nothing

- **WHEN** an action configured with `toActors` alone is delivered for a row
  that carries no frozen actor ids
- **THEN** the handler treats that row as resolving no address, and the
  delivery succeeds with an empty `recipients` list

#### Scenario: A literal recipient still sends when a token resolves nothing

- **WHEN** an action configures both a `to` address and `toActors`, and the
  tokens resolve no address
- **THEN** the handler sends to the literal address alone

### Requirement: A long recipient list sends in batches

The handler SHALL send to at most 100 recipients per SMTP session. It SHALL
split a longer resolved list into consecutive batches of at most 100, in list
order. It SHALL send one message per batch. It SHALL run the batches one
after another. Each batch SHALL be its own session with its own timeout bound.

#### Scenario: A list of 100 sends one message

- **WHEN** the resolved list holds exactly 100 addresses
- **THEN** the handler sends one message to all 100
- **AND** its `Message-ID` is the idempotency key with the sender's domain

#### Scenario: A list of 250 sends three messages

- **WHEN** the resolved list holds 250 addresses
- **THEN** the handler sends three messages, to 100, 100 and 50 addresses in
  list order

#### Scenario: A relay limit of 100 no longer defeats a group of 300

- **WHEN** the server answers `452` to every `RCPT TO` past its hundredth in
  one session, and the resolved list holds 300 addresses
- **THEN** all 300 addresses receive the message and the delivery succeeds

#### Scenario: A rejected address aborts only its own batch

- **WHEN** the server answers `550` to a `RCPT TO` in the second of two
  batches
- **THEN** the second batch sends no `DATA`
- **AND** the delivery dead-letters as a permanent failure

### Requirement: Each batch message names its own recipients and Message-ID

The `To:` header of a batch message SHALL name only that batch's addresses.
When the list needs several batches, each `Message-ID` SHALL carry the
batch's one-based number after the idempotency key. The value SHALL stay
identical across every try of the same delivery. A list of 100 or
fewer SHALL send one message with the `Message-ID` that "Every message
carries a deduplication signal" describes.

#### Scenario: Each message lists only its own addresses

- **WHEN** the resolved list holds 250 addresses
- **THEN** each of the three messages has a `To:` header naming only its own
  addresses
- **AND** the three `Message-ID` values differ

#### Scenario: A retried delivery repeats each batch's Message-ID

- **WHEN** the outbox redelivers a row after a transient failure and the
  resolved list needs three batches
- **THEN** the retry's three `Message-ID` values equal those of the first
  try

### Requirement: A batched delivery reports one result and fails as a whole

The result SHALL name every address of every batch, in list order. Its
`messageId` SHALL be the `Message-ID` of the first batch. A failure in a later
batch SHALL fail the whole delivery, even when an earlier batch is already
accepted. The retry then sends the earlier batches again, and their repeated
`Message-ID` values let a cooperating mail system dedupe them.

#### Scenario: The result names all recipients

- **WHEN** the resolved list holds 250 addresses and the delivery succeeds
- **THEN** the result's `recipients` holds all 250 addresses in list order
- **AND** its `messageId` equals the first message's `Message-ID`

#### Scenario: A transient failure in the second batch fails the delivery

- **WHEN** the server accepts the first of two batches and answers `450` to a
  `RCPT TO` of the second
- **THEN** the delivery retries as transient

### Requirement: A batched delivery stops before it outlives the claim lease

The outbox abandons a handler that outlives its 30-second claim lease. It
then retries the row. The handler SHALL always start the first batch. It
SHALL start a later batch only when that batch fits. A batch fits when the
elapsed time plus its timeout bound stays within the lease. Otherwise the
handler SHALL fail the delivery as transient and send nothing more.

An abandoned handler would keep sending batches that the retry sends again.

#### Scenario: A later batch that cannot fit stops the delivery

- **WHEN** the resolved list needs two batches
- **AND** the first batch takes longer than the lease minus the second
  batch's timeout bound
- **THEN** the handler opens no second session
- **AND** the delivery fails as transient

#### Scenario: A first batch always starts

- **WHEN** the action declares a timeout longer than the claim lease
- **THEN** the handler still starts the first batch

### Requirement: The handler drops a stored address that is no valid address

The handler SHALL drop every address from the account store that a `to` entry
of the same config would refuse. It SHALL write one warning line per dropped
address, naming the instance, the action and the account. The remaining
addresses SHALL send as usual. The delivery SHALL succeed. The handler SHALL
record no event.

A stored address with a line break or an angle bracket would reach an SMTP
command. A typo draws a `5xx` and drops the mail for its whole batch.

#### Scenario: A malformed address does not stop the other candidates

- **WHEN** `toActors` resolves three candidates and one account holds the
  address `max.muster`
- **THEN** the other two addresses receive the message
- **AND** one warning line names the instance, the action and the dropped
  account

#### Scenario: An address with a line break never reaches the server

- **WHEN** a resolved account holds an address with a CR and an LF in it
- **THEN** the handler sends no `RCPT TO` and no header with that text

#### Scenario: Only malformed addresses resolve

- **WHEN** every resolved account holds an invalid address
- **THEN** the handler opens no connection, and the delivery succeeds with an
  empty `recipients` list
