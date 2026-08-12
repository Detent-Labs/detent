<!-- antislop: allow-file passive-voice long-words synonym-rotation -->
<!-- The base spec at openspec/specs/notification-email-action-handler/spec.md
     carries these same three, for these same reasons; this delta edits its
     text, so it inherits them. passive-voice: SHALL-form normative spec prose,
     the convention every capability spec already follows. long-words:
     "attempt" is the outbox's own term (MAX_ATTEMPTS), and "candidate" is the
     assignment model's, neither chosen over a shorter synonym.
     synonym-rotation: "publish error" and "config-validation issue" are
     distinct domain terms carried over from http-action-handler, not
     rotation. -->

## MODIFIED Requirements

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

### Requirement: Every recipient is accepted before the message is sent

The handler SHALL issue one `RCPT TO` per address in the resolved recipient
list. It SHALL check every reply before it sends `DATA`. A rejected address
SHALL abort the delivery while no message has left the handler. A `5xx`
rejection SHALL be permanent, and a `4xx` rejection SHALL be transient. The
handler SHALL never deliver to part of the list.

Delivering to the accepted addresses and reporting the rejected ones would
break under at-least-once. A `4xx` rejection is transient, so the outbox
retries the row. Every already-accepted address then receives the message a
second time. Aborting before `DATA` is the only rule under which a retry
cannot duplicate.

#### Scenario: One rejected address sends nothing to anybody

- **WHEN** the resolved list names three addresses and the server answers
  `550` to the second `RCPT TO`
- **THEN** the handler sends no `DATA`, and the delivery dead-letters as a
  permanent failure

#### Scenario: A temporarily rejected address retries without duplicating

- **WHEN** the server answers `450` to one `RCPT TO` of several
- **THEN** the handler sends no `DATA`, and the delivery retries as transient
- **AND** no address received a message on the aborted attempt

## ADDED Requirements

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
