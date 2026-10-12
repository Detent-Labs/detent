# Spec Delta

## ADDED Requirements

### Requirement: The action refuses a target of another kind

The action SHALL compare the target instance's `kind` with the acting
instance's `kind`. A difference SHALL fail the delivery permanently, naming
both kinds. The target does not move.

A test instance therefore cannot move a published one, and a published instance
cannot move a test one. A retry cannot change either `kind`, so the refusal is
permanent.

#### Scenario: A test instance cannot move a published one
- **WHEN** an acting instance of kind `test` delivers an `instance.transition`
  naming a target of kind `published`
- **THEN** the delivery fails permanently, naming both kinds, and the target
  does not move

#### Scenario: A published instance cannot move a test one
- **WHEN** an acting instance of kind `published` delivers an
  `instance.transition` naming a target of kind `test`
- **THEN** the delivery fails permanently, and the target does not move

#### Scenario: Two instances of one kind move normally
- **WHEN** the acting instance and the target share a kind
- **THEN** the delivery moves the target, subject to the other checks

### Requirement: The action moves any instance the bound data source offers

The participant who submits the acting instance SHALL be able to pick any instance that the bound `"instance.query"` source offers. The source does not filter by the acting participant's visibility. The author bounds the offered set with the source's `statuses`, `stepIds` and `where` entries. Publish does not demand `stepIds`. The handler makes no visibility check.

#### Scenario: A participant moves an instance the source offers
- **WHEN** the bound source offers an instance the acting participant cannot
  otherwise see
- **AND** the participant picks it and submits
- **THEN** the delivery moves that instance, subject to the other checks

#### Scenario: A value the source does not offer never reaches the handler
- **WHEN** a participant submits an id the bound source does not offer
- **THEN** the submission fails the option check, and the acting instance
  enqueues no delivery
