## ADDED Requirements

### Requirement: Re-resolution isolates a poison instance from the batch

Each claimed instance SHALL be processed inside its own error boundary, covering the row body parse and
the body resolution as well as `resolveAutomatic`. A parse failure, a resolver that returns nothing, or a
resolver that throws SHALL requeue that one instance to `pending` and leave every other claimed instance
in the pass to be processed. A single poison instance SHALL NOT abort the pass and strand the rest of the
batch until their lease elapses.

Requeueing keys on the claimed row's `instance_id`, which is available without parsing the body, so a body
that cannot be parsed can still be returned to `pending` for a later pass.

#### Scenario: A poison instance does not starve its batch

- **WHEN** a re-resolution pass claims a batch containing one instance whose stored body cannot be parsed
  (or whose resolver throws) alongside instances that resolve normally
- **THEN** the normally-resolving instances are processed in that same pass and the poison instance is
  left `pending` for a later pass
