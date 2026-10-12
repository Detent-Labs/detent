# Spec Delta

## ADDED Requirements

### Requirement: Applying accepts every top-level key the definition contract declares

The JSON surface SHALL apply a body that carries any top-level key the
definition contract declares. Each key needs the right type, and
`collaboration` is an object. The shape check SHALL refuse a top-level key
the definition contract lacks.

#### Scenario: A body with process-level collaboration applies

- **WHEN** a draft carries `collaboration` with `comments` set to `false`, and
  the developer changes the label and clicks Apply
- **THEN** the parsed object replaces the draft's body
- **AND** the surface shows no error

#### Scenario: A body with a misspelled top-level key stops Apply

- **WHEN** the developer types `"colaboration": {}` and clicks Apply
- **THEN** the draft keeps its body
- **AND** an inline error names `colaboration`

### Requirement: A malformed nested container stops Apply

The shape check SHALL verify every container the studio reads as an array or
an object, at any depth. That covers the steps. On each step it covers the
paths, the action lists, the timers and the view. It covers
each field's options and group members too. A container of the wrong type,
`null` included, SHALL leave the draft's body as it was. The inline error
SHALL name the container's path.

#### Scenario: Steps typed as an object stop Apply

- **WHEN** the developer types `"steps": {}` inside `workflow` and clicks
  Apply
- **THEN** the draft keeps its body
- **AND** the inline error names `workflow.steps`
- **AND** the studio stays mounted with every unsaved edit intact

#### Scenario: A step typed as a string stops Apply

- **WHEN** the developer types a string as one element of `workflow.steps` and
  clicks Apply
- **THEN** the draft keeps its body
- **AND** the inline error names that element's index

#### Scenario: A nested list on one step stops Apply

- **WHEN** the developer types an object where the third step's `paths` belong
  and clicks Apply
- **THEN** the draft keeps its body
- **AND** the inline error names `workflow.steps[2].paths`

#### Scenario: An absent container does not stop Apply

- **WHEN** the developer applies a body in which a step omits `paths`,
  `timers` and `view`
- **THEN** the parsed object replaces the draft's body

#### Scenario: A well-typed body that breaks a contract rule applies

- **WHEN** the developer applies a body whose containers all have the right
  type, but one step has no outgoing path
- **THEN** the parsed object replaces the draft's body
- **AND** the studio's validation reports the rule on its Checks tab
