## ADDED Requirements

### Requirement: Delivery isolates a poison row from the batch

Each claimed row SHALL be processed inside its own error boundary, covering the action parse and the
post-handler mark transaction (the CAS to delivered/dead-letter/pending, the writeback, and the
`ActionOutcome` append) as well as the handler run. An unexpected throw from the action parse or the mark
transaction — a corrupt action row, or a transient error applying the writeback — SHALL leave that one row
`claimed` for reclaim after its lease and leave every other claimed row in the pass to be delivered. A
single poison row SHALL NOT abort the pass and strand the rest of the batch until their lease elapses.

The error boundary SHALL NOT itself mark the failed row, so the recovery is the same one a crashed worker
already relies on (lease reclaim) and no second write races the aborted mark transaction.

#### Scenario: A poison row does not starve its batch

- **WHEN** a delivery pass claims a batch in which one row's mark transaction throws (for example, a
  writeback whose target path is malformed) alongside rows that deliver normally
- **THEN** the normally-delivering rows reach `delivered` in that same pass and the poison row remains
  `claimed` for a later lease-reclaim
