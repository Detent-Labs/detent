# Spec Delta

## MODIFIED Requirements

### Requirement: Authoring invariant for the cancel-sink

<!-- antislop: allow passive-voice -->
The authoring-time validation SHALL enforce that every published body has exactly
one cancel-sink step. A body carrying zero or more than one cancel-sink MUST be
rejected.

The sink MUST also match the publish-time injection. Publishing SHALL reject a
body whose sink differs from that injection in any property or in its
position. It SHALL also reject a body whose `contract.outcomes` lacks the
reserved outcome. The check SHALL run on a body that already carries a sink.

<!-- antislop: allow passive-voice -->
#### Scenario: Missing cancel-sink is rejected
- **WHEN** a published body contains no cancel-sink step
- **THEN** validation rejects the body

<!-- antislop: allow passive-voice -->
#### Scenario: Duplicate cancel-sink is rejected
- **WHEN** a published body contains two cancel-sink steps
- **THEN** validation rejects the body

#### Scenario: A sink with another outcome fails
- **WHEN** a contracted body carries a terminal step with the cancel-sink id and the outcome `approved`, and `contract.outcomes` omits `cancelled`
- **THEN** publishing fails with a located issue naming the sink step

#### Scenario: A non-terminal sink fails
- **WHEN** a body carries a step with the cancel-sink id that is not terminal
- **THEN** publishing fails with a located issue naming the sink step

#### Scenario: A sink with actions fails
- **WHEN** a body carries a sink that declares an `onEntry` action
- **THEN** publishing fails with a located issue naming the sink step

#### Scenario: A compiled body publishes unchanged
- **WHEN** the author publishes the output of a previous compile again
- **THEN** publishing accepts it and returns a byte-identical body
