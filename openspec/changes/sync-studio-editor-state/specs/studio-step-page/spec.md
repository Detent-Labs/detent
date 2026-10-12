# Spec Delta

## ADDED Requirements

### Requirement: A timer keeps the kind the author chose

A timer has one of two kinds, a time limit or a deadline. The kind select SHALL show the kind the stored timer holds. Clearing the deadline text SHALL keep the timer a deadline with an empty expression. It SHALL NOT turn the timer into a time limit, and the deadline input SHALL stay on the page.

#### Scenario: An emptied deadline stays a deadline

- **WHEN** a timer holds the deadline `data.due_at`
- **AND** the author clears the deadline text
- **THEN** the kind select still reads the deadline kind
- **AND** the deadline input still shows, empty
- **AND** the timer holds `deadline` with an empty `src` and no `duration`

#### Scenario: The author can still switch kind

- **WHEN** the deadline text is empty
- **AND** the author picks the time limit kind
- **THEN** the timer holds a `duration` and no `deadline`
- **AND** the number and unit controls show
