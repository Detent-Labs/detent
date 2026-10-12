# Spec Delta

## ADDED Requirements

### Requirement: A column choice carries the declared type of its field

Each column choice SHALL carry `type`, the declared base type of its field. When several versions in range declare the field, the newest of them decides. A field whose declared type is a plugin envelope has no `type`. A builder reads `type` to write a comparison literal of the right JSON type.

#### Scenario: A choice carries the declared type
- **WHEN** a version in range declares field A as `number`
- **THEN** the column choice for field A carries `type` `number`

#### Scenario: The newest declaring version decides
- **WHEN** version 1 declares field A as `string` and version 2 declares it as `number`
- **AND** instances of both versions fall in the report's query range
- **THEN** the column choice for field A carries `type` `number`
- **AND** it still names both versions

#### Scenario: A plugin-typed field has no type
- **WHEN** a version in range declares field A with a plugin envelope as its type
- **THEN** the column choice for field A has no `type` key
