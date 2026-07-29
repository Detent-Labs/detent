## ADDED Requirements

### Requirement: A pattern constraint is tested only after the length constraints pass, against a cached expression

When validating a submitted value against `FieldValidation`, the engine SHALL
evaluate `pattern` only if that value's `minLength`/`maxLength` constraints
were satisfied. A value that already violates a length constraint is rejected
regardless, so running a pattern — which may backtrack catastrophically and
which JavaScript cannot time out — against an over-long, submitter-supplied
string is unnecessary work with an unbounded worst case. Today the length
violation is recorded and execution falls through to the pattern test.

The compiled `RegExp` for a pattern SHALL be cached per published body rather
than constructed per submission and per field. A published body is immutable,
which is what makes it a sound cache key.

A pattern reaching this point is known to compile, because the compile pass
rejects one that does not (`definition-contract`). Construction failure at
submission time is therefore no longer an expected condition.

#### Scenario: An over-long value is not pattern-tested

- **WHEN** a submitted string exceeds the field's `maxLength` and the field
  also declares a `pattern`
- **THEN** the length issue is reported and the pattern is not evaluated
  against that value

#### Scenario: A conforming-length value is pattern-tested as before

- **WHEN** a submitted string satisfies the field's length constraints
- **THEN** the pattern is evaluated and a mismatch is reported exactly as it
  is today

#### Scenario: Repeated submissions reuse one compiled expression

- **WHEN** many submissions validate the same field of the same published
  body
- **THEN** the pattern is compiled once for that body, not once per
  submission
