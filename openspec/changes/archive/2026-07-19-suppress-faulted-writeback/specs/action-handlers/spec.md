## MODIFIED Requirements

### Requirement: A writeback to a terminal instance is suppressed

If the instance is not `running` at delivery time — that is, `completed`,
`cancelled`, or `faulted` — the `data` writeback SHALL be suppressed so a
non-running instance remains data-immutable; the `ActionOutcome` SHALL still be
recorded, with its `suppressed` flag set so the dropped writeback is auditable.
Only a `running` instance accepts a writeback. A `faulted` instance is a dead-end
error park (nothing transitions out of it), so a late-arriving action's result is
suppressed just as for a `completed` or `cancelled` instance.

#### Scenario: A completed instance is not mutated by a late writeback
- **WHEN** a handler result arrives for an instance whose status is already `completed`
- **THEN** no value is written into `data` and the recorded `ActionOutcome` has `suppressed: true`

#### Scenario: A faulted instance is not mutated by a late writeback
- **WHEN** a handler result arrives for an instance whose status is `faulted`
- **THEN** no value is written into `data` and the recorded `ActionOutcome` has `suppressed: true`
