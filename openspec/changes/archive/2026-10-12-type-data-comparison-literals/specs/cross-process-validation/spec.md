# Spec Delta

## ADDED Requirements

### Requirement: A compared literal matches the declared type of its field

Publishing SHALL reject an `"instance.query"` comparison when no live target version admits its literal. The literal is the entry's `value`, or each member of an `in` list. A version admits a literal when it declares the compared field. The literal must also pass the type check that a participant's submission faces. A `null` literal is exempt. A comparison that reads `valueFromField` has no literal and is exempt.

#### Scenario: A string literal on a number field fails the publish
- **WHEN** an `"instance.query"` comparison names a target field every live version declares as `number`
- **AND** the comparison carries the literal `"5"`
- **THEN** publishing fails with a cross-process validation error naming the data source, the field and the literal
- **AND** the engine persists no version

#### Scenario: A string literal on a boolean field fails the publish
- **WHEN** an `"instance.query"` comparison names a target field every live version declares as `boolean`
- **AND** the comparison carries the literal `"true"`
- **THEN** publishing fails with a cross-process validation error

#### Scenario: A literal of the declared type publishes
- **WHEN** an `"instance.query"` comparison carries the number `5` on a field every live version declares as `number`
- **THEN** publishing succeeds

#### Scenario: The check covers each member of an in list
- **WHEN** an `"instance.query"` comparison uses `in` on a `number` field
- **AND** the list is `[1, "two"]`
- **THEN** publishing fails with a cross-process validation error naming the member `"two"`

#### Scenario: A null literal publishes
- **WHEN** an `"instance.query"` comparison carries the literal `null` on a `number` field
- **THEN** publishing succeeds

#### Scenario: A plugin-typed field admits any literal
- **WHEN** an `"instance.query"` comparison names a field whose declared type is a plugin envelope
- **AND** the comparison carries a string literal
- **THEN** publishing succeeds

#### Scenario: A comparison reading a field of the publishing process is exempt
- **WHEN** an `"instance.query"` comparison carries `valueFromField` and no literal
- **THEN** this check raises no error for it

### Requirement: A literal that one live version admits passes

The check SHALL pass a literal that one live version admits. It reads the target versions that hold live instances, as the reference check does. A field retyped between two live versions stays publishable. A literal that no live version admits never equals a stored value. With `eq` it matches no instance. With `ne` it matches every instance that holds the field.

#### Scenario: One admitting live version is enough
- **WHEN** one live target version declares a field as `string`
- **AND** another live version declares it as `number`
- **AND** a comparison carries the literal `5`
- **THEN** publishing succeeds

### Requirement: The literal check takes the publish-path placement

The literal check SHALL run on the publish path, with the other database-resolving checks. The first placement criterion of `definition-contract` decides this: a hand-written body must not bypass the check. The check reads the live versions of another process, so it cannot run in the compile pass. A schema refinement could not read them either.

#### Scenario: A hand-written body cannot skip the check
- **WHEN** a hand-written body satisfies the published schema
- **AND** it carries a string literal on a number field of the target
- **THEN** publishing rejects it with a cross-process validation error
