# Spec Delta

## ADDED Requirements

### Requirement: A view refuses a range holding too many instances

Each reporting view loads the in-range instances of its process into memory.
A view SHALL answer `400` and compute nothing when the range holds more than
20000 instances. Test instances do not count. The view SHALL NOT answer with a
partial result. A sample of the newest instances would bias every percentile
and rate. A range holding exactly 20000 instances gets an answer.

#### Scenario: A range above the cap gets a refusal

- **WHEN** a client requests the cycle-time, bottleneck or SLA view for a range
  that holds 20001 instances
- **THEN** the response is `400`, and it has no figures

#### Scenario: A range at the cap gets an answer

- **WHEN** a client requests a view for a range that holds exactly 20000
  instances
- **THEN** the response is `200` with that view's result

#### Scenario: A test instance does not count toward the cap

- **WHEN** a range holds 20000 ordinary instances and one test instance
- **THEN** the response is `200` with that view's result
