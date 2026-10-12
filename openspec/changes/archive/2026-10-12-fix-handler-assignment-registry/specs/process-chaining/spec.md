# Spec Delta

## ADDED Requirements

### Requirement: The started instance resolves assignment with the engine's strategies

Every step entry of the started instance SHALL resolve its assignment with the
strategies the engine runs with. That holds while the engine creates the
instance and while it drives the instance to rest. The set has `static` and each
org-aware strategy. A strategy that publish accepted MUST NOT resolve to an
empty list for want of a registration.

#### Scenario: A group-members start step resolves its members

- **WHEN** a `process.start` action starts a process whose start step declares
  `org.group-members` for a group with two members
- **THEN** the started instance's candidates are those two members, and no
  `assignment.unresolved` event is recorded

#### Scenario: An actor-from-field start step reads the mapped value

- **WHEN** a `process.start` action maps a person into the field that the
  target's start step names in `org.actor-from-field`
- **THEN** the started instance's candidates hold that person
