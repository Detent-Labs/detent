# Spec Delta

## ADDED Requirements

### Requirement: An action handler resolves assignment with the engine's registry

A handler that enters a step on an instance SHALL resolve that step with the
`AssignmentRegistry` the running engine uses. The delivery context carries that
registry on every delivery, and the field is not optional. No handler SHALL
build a registry of its own. Such a handler would resolve every strategy it does
not know to an empty list, and the instance would stall.

#### Scenario: The delivery context carries the engine's registry

- **WHEN** the engine delivers an action for a tenant
- **THEN** the handler's context holds the registry the engine runs with

#### Scenario: A handler resolves an org-aware strategy

- **WHEN** a handler enters a step declaring an `org.*` strategy
- **THEN** the step resolves through that strategy's resolver, and not to an
  empty list for want of a registration
