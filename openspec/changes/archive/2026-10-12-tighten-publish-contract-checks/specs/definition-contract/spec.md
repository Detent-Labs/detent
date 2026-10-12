# Spec Delta

## ADDED Requirements

### Requirement: An action declares async execution only

An action's `execution` MAY be absent or `"async"`. The value `"blocking"` SHALL
fail to parse, because the engine delivers every action after the commit and
has no blocking delivery. The enum SHALL gain `"blocking"` again only in the
change that builds blocking delivery.

#### Scenario: A blocking action fails

- **WHEN** a body declares an action with `execution: "blocking"`
- **THEN** publishing fails and no version exists afterwards

#### Scenario: An async action publishes

- **WHEN** a body declares an action with `execution: "async"`
- **THEN** publishing accepts the body

### Requirement: An action has no authored idempotency key

The action contract SHALL declare no `idempotencyKey`. The engine derives every
outbox row's key from the instance, the transition sequence and the action id.
An author-chosen constant would merge the deliveries of different instances
onto one row.

#### Scenario: An authored idempotency key fails

- **WHEN** a body declares an action with an `idempotencyKey` key, even `null`
- **THEN** publishing fails with a located issue naming that key as unknown
