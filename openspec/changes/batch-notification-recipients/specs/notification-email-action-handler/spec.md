# Spec Delta

## MODIFIED Requirements

<!-- antislop: allow passive-voice -->
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
- **AND** no address received a message on the first try

## ADDED Requirements

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
