# Spec Delta

## ADDED Requirements

### Requirement: The instance view carries the instance's transition sequence

`getInstanceView` SHALL include a `transitionSeq` field in the returned
`InstanceView`. The field SHALL carry the instance's persisted
`transitionSeq`, the count of its committed transitions. The field SHALL
always be present, whatever the instance's `status`.

#### Scenario: A view reports the current sequence

- **WHEN** an authorized actor calls `getInstanceView` for an instance that
  has committed three transitions
- **THEN** the returned view carries `transitionSeq` equal to the instance's
  own `transitionSeq`

#### Scenario: The sequence reports whatever the status

- **WHEN** an authorized actor calls `getInstanceView` for a completed,
  cancelled, or faulted instance
- **THEN** the returned view still carries `transitionSeq`
