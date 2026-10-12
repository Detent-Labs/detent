# Spec Delta

## ADDED Requirements

### Requirement: The Player's step form is read-only when it offers no submit

The Player SHALL pass `formIsReadonly(view)` to `FieldForm` as `readonly`, so it matches the participant's task screen.
The Player SHALL add no note, because an author drives the instance to test it.

#### Scenario: A finished test instance is read-only

- **WHEN** the Player opens an instance that has completed
- **THEN** every input of the step form stays disabled

#### Scenario: A step with a path stays editable

- **WHEN** the Player opens a running instance whose step has an available path
- **THEN** the non-readonly inputs accept input
