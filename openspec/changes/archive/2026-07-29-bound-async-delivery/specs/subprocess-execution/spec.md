## MODIFIED Requirements

### Requirement: Map parent data into the child input

At spawn time the engine SHALL evaluate the subprocess step's `inputMapping`
(CEL expressions over the parent's frozen context, without the `result` or
`child` namespaces) and write the results into the child instance's initial
`data`, keyed by the child field ids that are the mapping targets. Mapping
targets MUST be resolvable child input fields.

Evaluation SHALL be total per entry, matching migration `transforms` rather
than throwing for the whole map: an entry whose expression raises, or whose
value cannot be made JSON-safe, SHALL be omitted from the child's initial
`data` while every other entry is still written, and the omission SHALL be
recorded as a `mapping.entry-dropped` event (see `runtime-events`). The same
rule SHALL apply to `outputMapping` when a child returns.

A mapping over a field the parent never wrote is the ordinary case, not an
authoring error: the field catalog has no notion of "always written", and
requiredness lives per-step in the view, so an optional field is legitimately
unset at spawn time. Failing the whole mapping there dead-letters the
engine-internal spawn or return row — re-running its work on each retry — and
leaves the parent parked with no fault event, which is a worse outcome than a
recorded omission for both the author and the participant. A child missing an
input still meets its own step-level required check at its first submission,
where the failure is visible to a person.

#### Scenario: Input mapping seeds the child data
- **WHEN** a subprocess step declares `inputMapping` from parent fields to child input fields
- **THEN** the spawned child starts with each mapped child field set to its evaluated CEL value over the parent's data

#### Scenario: One raising entry does not fail the spawn

- **WHEN** one `inputMapping` entry raises because it reads a parent field the
  instance never wrote, and the others evaluate cleanly
- **THEN** the child is spawned with the other entries applied, the raising
  entry's target unset, and a `mapping.entry-dropped` event recorded

#### Scenario: One raising entry does not fail the return

- **WHEN** one `outputMapping` entry raises while a child is returning
- **THEN** the parent's writeback applies the remaining entries, the return
  commits, and a `mapping.entry-dropped` event is recorded
