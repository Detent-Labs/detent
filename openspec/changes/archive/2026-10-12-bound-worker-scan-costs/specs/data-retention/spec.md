# Spec Delta

## MODIFIED Requirements

### Requirement: The sweep selects eligible instances in bounded, paginated batches

A sweep tick SHALL NOT select every eligible instance in one unbounded
query. It SHALL select at most 500 instance ids at a time. It SHALL page them
by keyset on the entry time and then `instance_id`, oldest first. The entry
time is `currentStepEnteredAt`, or `startedAt` when that key is absent.

A tick SHALL keep paging through further batches until no eligible
instance remains. It SHALL NOT stop after the first batch. The cost of a tick SHALL follow the
number of eligible instances and not the number of stored instances.

<!-- antislop: allow passive-voice - a MODIFIED block keeps the live scenario name verbatim -->
#### Scenario: A backlog larger than one batch is fully processed in one tick

- **WHEN** a sweep tick runs and more than 500 instances are eligible
- **THEN** the tick redacts every eligible instance, and not just the first 500

#### Scenario: No single query selects an unbounded result set

- **WHEN** a reader inspects the sweep's selection query
- **THEN** it carries a bound on the number of rows it can return in one
  round trip

#### Scenario: A failing instance does not hide the instances behind it

- **WHEN** a sweep tick selects an eligible instance whose redaction fails,
  and further eligible instances follow it in entry-time order
- **THEN** the tick still selects and redacts those further instances
- **AND** the next tick selects the failing instance again

#### Scenario: A tick with nothing eligible reads no stored instance

- **WHEN** a sweep tick runs and every terminal instance sits inside the
  retention window
- **THEN** the selection query reads no instance row
