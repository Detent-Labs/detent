# Spec Delta

## ADDED Requirements

### Requirement: The strip and the card marks print each flag's one name

The selected field's strip SHALL caption its three flag controls "Asked",
"Required" and "Read-only", and its span control "Width". A placed field's
card SHALL print its marks as "Required" and "Read-only". A note's strip
SHALL caption its text "Text", its group "Group" and its tab "Tab". No
caption on the form editor SHALL be the JSON key the control writes.

#### Scenario: The strip captions its controls in words

- **WHEN** an author selects a placed field
- **THEN** the strip's captions read Asked, Required, Read-only and Width

#### Scenario: A card's marks read in words

- **WHEN** a placed field's `required` and `readonly` are both the literal
  `true`
- **THEN** its card prints the marks "Required" and "Read-only"

#### Scenario: A note's strip captions its controls in words

- **WHEN** an author selects a note
- **THEN** the strip's captions read Text, Asked, Width and Group
