## ADDED Requirements

### Requirement: A new path takes the trigger its source step already uses

A new path SHALL take its trigger from its source step, whichever surface
creates it. The canvas's connect drag and the step page's "add path" action
SHALL apply one rule. A source step of type `subprocess` gets `automatic`.
Any other source step with paths gets the trigger of its first path. A source
step with no path gets `manual`.

A step's paths are all manual or all automatic. A subprocess step's paths are
all automatic. The rule keeps a new path from making the step invalid at the
moment of creation.

#### Scenario: Add path on a step with automatic paths

- **WHEN** the developer picks a target on a step with automatic paths
- **AND** uses the step page's "add path" action
- **THEN** the new path is automatic

#### Scenario: Add path on a subprocess step

- **WHEN** the developer uses "add path" on a step of type `subprocess`
- **THEN** the new path is automatic, whatever paths the step already holds

#### Scenario: Add path on a step with no path

- **WHEN** the developer uses "add path" on an ordinary step with no path
- **THEN** the new path is manual

#### Scenario: A connect drag from a subprocess step

- **WHEN** an author drags a connection from a subprocess step that has no path
- **THEN** the new path is automatic
