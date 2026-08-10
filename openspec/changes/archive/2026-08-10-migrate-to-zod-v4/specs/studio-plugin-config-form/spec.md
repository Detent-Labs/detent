## ADDED Requirements

### Requirement: A config schema carrying a cross-field rule still yields a generated form

A registered type whose config schema carries a cross-field rule SHALL yield a
generated form. A type whose schema carries no such rule already does. The
editor SHALL NOT fall back to the raw JSON textarea for either.

The generated form checks per-field rules alone. It SHALL NOT report a
cross-field rule inline. Publish applies the cross-field rule, through the
registry check that already parses a config against its schema.

A form that reports no inline error can therefore still meet a publish error.
That is already true of every type the form covers, because the form describes
a schema rather than replacing it.

#### Scenario: A cross-field rule does not send the editor to raw JSON

- **WHEN** a developer selects a registered type whose config schema carries a
  cross-field rule over two properties
- **THEN** the editor shows one input per schema property, not the raw JSON
  textarea

#### Scenario: A per-field error still reports inline

- **WHEN** a developer enters a value that breaks a per-field rule on such a
  type
- **THEN** the editor shows an error next to that field before publish

#### Scenario: A cross-field rule reports at publish

- **WHEN** a developer fills the generated form so that every per-field rule
  passes and the cross-field rule fails
- **THEN** the editor shows no inline error, and publish rejects the definition
  with an error naming that plugin position
