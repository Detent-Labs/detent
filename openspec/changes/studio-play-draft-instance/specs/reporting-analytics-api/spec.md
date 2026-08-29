<!-- antislop: allow-file long-words passive-voice sentence-length -->
<!-- This delta spec is new (no prior committed version) and its MODIFIED requirement must carry the base spec's full text, so the ratchet reads the base spec's own existing Gherkin/SHALL-normative style as a rise; not rewritten here per openspec-delta-specs-import-antislop-debt. -->

## MODIFIED Requirements

### Requirement: Every reporting view is scoped to one process and a date range

Each reporting view SHALL take exactly one process id and an optional
inclusive date range, and SHALL consider only instances of that process whose
`instances.startedAt` falls within the range. The range SHALL bound the
instances scanned, never the individual history timestamps, so an instance
that starts inside the range and finishes after it closes is fully counted.
No view SHALL combine data from more than one process. When no range is
supplied the server SHALL apply no implicit range of its own.

Every view SHALL compute on each request from the live record, with no cached
result, no precomputed rollup and no background aggregation job.

An instance created for the purpose of testing a draft SHALL be excluded from
every reporting view entirely: it SHALL contribute no row, no traversal, no
duration and no count to the cycle-time, bottleneck or SLA computation, and
SHALL NOT be counted toward `skippedInstances` or any other aggregate the
views report. A process's reported metrics SHALL be identical whether or not
any such test instance of that process exists.

#### Scenario: An instance started before the range is excluded

- **WHEN** a cycle-time, bottleneck or SLA view is requested with a range whose
  start is after an instance's `startedAt`
- **THEN** that instance contributes to none of the three views

#### Scenario: An instance started inside the range but still running is in range

- **WHEN** an instance starts inside the requested range and has not finished
- **THEN** it is in range, and each view applies its own status rule to decide
  what the instance contributes

#### Scenario: A repeated request reflects a state change immediately

- **WHEN** an instance transitions between two otherwise identical requests for
  the same view, process and range

- **THEN** the second response reflects the transition

#### Scenario: A test instance is excluded from every metric

- **WHEN** a process has both ordinary instances and instances created for the
  purpose of testing a draft, all in range, and the cycle-time, bottleneck and
  SLA views are requested
- **THEN** each view reports exactly the figures it would report if the test
  instances did not exist at all: the same sample size, the same percentiles,
  the same per-step averages, the same bottleneck ranking and work-in-progress
  counts, and the same SLA breach rates

#### Scenario: A test instance contributes no work-in-progress count

- **WHEN** an instance created for the purpose of testing a draft is currently
  parked, unfinished, in a step
- **THEN** the bottleneck view's work-in-progress count for that step is the
  same as if that test instance did not exist
