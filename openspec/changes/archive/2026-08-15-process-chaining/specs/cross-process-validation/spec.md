## ADDED Requirements

### Requirement: A process.start action's processId resolves to a published process

Publishing a process SHALL reject an unresolvable `process.start`
reference. Its `processId` must resolve to at least one published
version of that process.

This capability already validates a subprocess reference the same way. A
chain target needs no `contract`, though. An uncontracted resolved
process is not a rejection reason here.

#### Scenario: Publishing rejects a process.start action naming an unpublished process
- **WHEN** a body carries a `process.start` action whose `processId` matches no published process
- **THEN** publishing that body fails with a cross-process validation error naming the offending action, and the engine persists no version

#### Scenario: A process.start action naming a published, uncontracted process publishes
- **WHEN** a body carries a `process.start` action whose `processId` resolves to a published process that declares no `contract`
- **THEN** publishing succeeds, unlike the equivalent case for a subprocess reference

### Requirement: A process.start action's inputMapping targets lie within the target process's field catalog

Publishing a process SHALL reject an `inputMapping` target key that is
not a declared field of the target process. That check uses the
process's full field catalog, not a `ProcessContract.inputFields` list.
The check resolves the target body via the definition store, the same
resolution the `processId` check above already performs.

#### Scenario: Publishing rejects an out-of-catalog inputMapping target
- **WHEN** a `process.start` action maps a value to a field id that is not in the resolved target process's field catalog
- **THEN** publishing fails with a cross-process validation error naming the offending field

#### Scenario: inputMapping targeting only declared fields publishes
- **WHEN** every `inputMapping` target of every `process.start` action is a declared field of its resolved target process
- **THEN** the process publishes normally
