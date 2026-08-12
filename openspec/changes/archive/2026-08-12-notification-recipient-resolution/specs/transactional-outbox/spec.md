<!-- antislop: allow-file passive-voice -->
<!-- passive-voice: SHALL-form normative spec prose, the convention the base
     spec at openspec/specs/transactional-outbox/spec.md already follows. -->

## ADDED Requirements

### Requirement: Each outbox row is stamped with the actor ids in force at enqueue

Every `INSERT INTO outbox` SHALL stamp the new row with the actor ids the
enqueuing instance holds at that moment. Three parts make up the stamp:

- the assignment candidate list
- the id holding the claim, when one holds it
- the id that started the instance

This applies to every enqueue site: instance creation's initial-step spawn, a
transition's general step-entry enqueue, and a timer firing's enqueue. Each of
the three already holds the instance it is committing. The stamp therefore
reads state in hand rather than sending a query.

The stamp SHALL be frozen. A later change to the instance's assignment SHALL
NOT rewrite an already-enqueued row. Delivery therefore sees the actors of the
commit that enqueued the action. It does not see the actors of whatever step
the instance has since reached.

Freezing is what makes the value correct. The resolution worker drives
automatic cascades without waiting for the outbox. An instance can therefore
sit two steps on by the time a row drains. A delivery-time read would name the
wrong actors in exactly that case.

A row enqueued before this stamp existed SHALL carry no actor ids. Nothing
backfills them. No published body could name an actor recipient before this
change, so no such row has a consumer.

#### Scenario: A row enqueued at instance creation carries the actor ids

- **WHEN** an instance is created and its initial step enqueues actions
- **THEN** each enqueued row carries the instance's candidate list, claimant
  and starter as of that creation

#### Scenario: A row enqueued by a transition carries the actor ids

- **WHEN** a transition commits and enqueues trigger actions
- **THEN** each enqueued row carries the instance's candidate list, claimant
  and starter as of that commit

#### Scenario: A row enqueued by a timer fire carries the actor ids

- **WHEN** a timer fires and enqueues its actions
- **THEN** each enqueued row carries the instance's candidate list, claimant
  and starter as of that fire

#### Scenario: A later assignment change leaves an enqueued row alone

- **WHEN** a row is enqueued for a step whose candidate list holds one actor
- **AND** the instance then transitions to a step resolving a different
  candidate
- **THEN** the pending row still carries the first candidate

#### Scenario: Delivery hands the stamped ids to the handler

- **WHEN** a stamped row is claimed and delivered
- **THEN** the handler receives the ids the row carries

#### Scenario: A row predating the stamp still delivers

- **WHEN** a row enqueued before the stamp existed is claimed and delivered
- **THEN** the delivery proceeds, and the handler receives no actor ids
