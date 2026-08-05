## ADDED Requirements

### Requirement: A form states a required field natively

A form SHALL mark a field the submission needs with the `required` attribute.
It SHALL NOT hold its submit control disabled to express the same rule.

The reason is that a disabled control gives no reason. It leaves the pointer
with nothing to click, and the screen reader with nothing to announce. Someone
who left one field empty learns only that the button stopped working. The
`required` attribute instead puts the browser's own message beside the field
that wants it, and moves focus there.

A submit control MAY still go disabled while its submission is in flight. That
states a fact about the request rather than a rule about the input.

#### Scenario: A person submits the login form with an empty field

- **WHEN** a person leaves the email or the password empty and activates
  Sign in
- **THEN** the browser blocks the submission, names the empty field, and moves
  focus to it
- **AND** the submit control was reachable and activatable the whole time

#### Scenario: A submission in flight disables the control

- **WHEN** a login request is in flight
- **THEN** the form disables the submit control until that request settles

#### Scenario: A required field carries no invalid-state styling before use

- **WHEN** the login form first renders with both fields empty
- **THEN** neither field carries invalid-state styling, because the form styles no
  `:invalid` state
