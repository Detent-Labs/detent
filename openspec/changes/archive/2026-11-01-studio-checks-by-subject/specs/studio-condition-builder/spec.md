<!-- antislop: allow-file synonym-rotation -->
<!-- Why: copied from the live spec, whose scenarios use both verbs. -->
# Spec Delta

## ADDED Requirements

### Requirement: A way out's guard stands under "Only if" for either trigger

The row SHALL render the existing `ConditionBuilder` row UI under an "Only if"
heading for both triggers. On an automatic way out the guard decides whether
the engine takes it. On a manual way out the guard decides whether the person
gets the button. The row SHALL say so beside the guard. The `priority` input
SHALL render for an automatic way out alone.

#### Scenario: An automatic way out shows the guard under "Only if"

- **WHEN** a way out's `trigger` is `automatic`
- **THEN** the existing `ConditionBuilder` row UI renders under an "Only if"
  heading
- **AND** a `priority` input renders beside it

#### Scenario: A manual way out shows its guard editor

- **WHEN** the developer opens a manual way out
- **THEN** the "Only if" heading and the `ConditionBuilder` row UI render
- **AND** no `priority` input renders

## MODIFIED Requirements

### Requirement: Every condition site keeps its CEL in a Developer view

Every condition site SHALL hold its CEL in a disclosure labeled "Developer
view" under the builder. The disclosure SHALL stand closed on open, except
over source that does not parse. The rows and the sentence SHALL stay
visible while it stands open. Other specs name this disclosure the site's
CEL toggle.

One site already stands inside a Developer view: the form editor's flag
override. It SHALL show the CEL text input with no second disclosure.

#### Scenario: A way out's guard holds its CEL in a Developer view

- **WHEN** a developer opens a way out's "Only if" on the Steps tab
- **THEN** a closed "Developer view" disclosure stands under the sentence
- **AND** opening it shows the CEL text input, with the rows still above it

#### Scenario: The field catalog's condition row holds its CEL in a Developer view

- **WHEN** a developer opens "Only ask this when" on the Fields tab
- **THEN** a closed "Developer view" disclosure stands under the sentence
- **AND** no "Edit as CEL" control appears

#### Scenario: The form editor's override shows no second disclosure

- **WHEN** a developer opens a flag's Developer view in the form editor and
  picks CEL
- **THEN** the builder, the sentence and the CEL text input appear, with no
  second "Developer view" disclosure

## REMOVED Requirements

<!-- antislop: allow sentence-length -->
<!-- Why: the heading repeats the live spec's wording, which a REMOVED block must match. -->
### Requirement: A way out's guard stands under "Only when" for either trigger
**Reason**: The vocabulary table reads "only if" for a guard, and the canvas prints it.
**Migration**: "A way out's guard stands under "Only if" for either trigger" states the same rule.
