## ADDED Requirements

### Requirement: The three bulk flag badges render at one shared width

Each bulk flag badge the field matrix draws SHALL render at one shared
fixed width. The width SHALL be the same for `visible`, `required` and
`readonly` alike. It SHALL fit the widest badge. The two-character
`readonly` badge then reads as a member of the group, not a narrower
badge. This holds on the panels screen's column and row headers
wherever they carry a bulk badge.

#### Scenario: The readonly badge is no narrower than its neighbors

- **WHEN** the field matrix draws a column or row header whose eligible
  set holds more than one flag
- **THEN** each badge renders at the same width as its neighbors
- **AND** the `readonly` badge is no narrower than the `visible` or
  `required` badge
