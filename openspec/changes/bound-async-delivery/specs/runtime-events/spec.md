## ADDED Requirements

### Requirement: A dropped subprocess mapping entry is recorded as an event

Subprocess `inputMapping` and `outputMapping` evaluation SHALL be total per
entry: an entry whose expression raises, or whose result cannot be made
JSON-safe, SHALL leave its target field unwritten and SHALL NOT fail the spawn
or the return. That omission SHALL be recorded as a `mapping.entry-dropped`
event naming the target `fieldId`, the `direction` (`"input"` for an
`inputMapping` entry, `"output"` for an `outputMapping` one) and the reason
(`"expression-raised"` when the CEL evaluation threw,
`"value-out-of-range"` when evaluation succeeded but its result could not be
represented as a JSON-safe value) — the same reason vocabulary
`migration.transform-dropped` uses.

The event SHALL be recorded on the instance whose mapping was evaluated — the
**parent**, since both mappings are evaluated over the parent's context — in
the same transaction as the spawn's or the return's own commit, carrying the
`version` and `transitionSeq` in force without advancing the sequence.

Like `timer.unarmed`, `migration.skipped`, `subprocess.outcome-unmatched` and
`migration.transform-dropped`, this event enqueues no actions and SHALL carry
no `ActionOutcome`s.

This makes a mapping degrade the way a guard already does. A guard over a
field the instance never wrote evaluates `false` and the instance waits; a
transform over one is dropped and recorded. A mapping over one currently
throws, which dead-letters the engine-internal spawn or return row after
re-running its work on every retry and leaves the parent parked with no fault
event at all. Nothing at publish can distinguish a field that is *declared*
from one that is *always written* — the catalog has no such notion and
requiredness lives per-step in the view — so the fatal path punishes a
legitimate authoring shape.

#### Scenario: An input mapping over an unwritten field is dropped

- **WHEN** a subprocess step's `inputMapping` entry reads a parent field the
  instance never wrote, and its evaluation raises
- **THEN** the child is spawned without that field in its initial `data`, and
  a `mapping.entry-dropped` event naming the field, `"input"` and
  `"expression-raised"` is recorded on the parent in the spawn's transaction

#### Scenario: An output mapping over an unwritten field is dropped

- **WHEN** a returning child's `outputMapping` entry raises
- **THEN** the parent's writeback omits that field, the return still commits,
  and a `mapping.entry-dropped` event naming the field and `"output"` is
  recorded

#### Scenario: An out-of-range mapping result is recorded

- **WHEN** a mapping entry evaluates successfully but yields a value that
  cannot be represented as a JSON-safe value
- **THEN** the target is left unwritten and the event names the reason
  `"value-out-of-range"`

#### Scenario: A fully evaluable mapping records no event

- **WHEN** every mapping entry evaluates to a JSON-safe value
- **THEN** no `mapping.entry-dropped` event is recorded and the behavior is
  identical to today's

#### Scenario: The event carries no action outcomes

- **WHEN** a `mapping.entry-dropped` event is recorded
- **THEN** it carries no `actions` field, since no actions were enqueued
