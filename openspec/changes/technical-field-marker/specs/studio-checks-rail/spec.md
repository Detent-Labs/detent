## ADDED Requirements

### Requirement: The rail reports an unwritten technical field

A field declaring `technical: true` SHALL report where no structural
source writes it, and it declares no `default`. The rail SHALL check the
same four structural sources the unwritable-requirement rule already
reads. Each is an action's `output`, a subprocess's `outputMapping`, a
field's `columnMapping`, or a `contract.inputFields` entry. This finding
carries the `view` source. It anchors on the field itself, not on any one
step, since `technical` is a catalog-level declaration.

A field declaring a `default` SHALL NOT report, even where no structural
source writes it. `default` is itself a writer. The four structural
sources above do not enumerate it.

This finding is non-blocking. It never holds up a publish. The compile
pass's own rejection of a technical field's wired-editable view entry is
the publish-blocking half of this pair.

#### Scenario: An unwritten technical field reports

- **WHEN** a field declares `technical: true`
- **AND** no action output, subprocess output mapping, column mapping or
  contract input field targets it
- **AND** the field declares no `default`
- **THEN** the rail shows an entry under its `view` group, naming that
  field

#### Scenario: A structurally written technical field raises nothing

- **WHEN** a field declares `technical: true`
- **AND** an `Action.output` map targets that field
- **THEN** the rail shows no entry for it

#### Scenario: A default exempts an otherwise-unwritten technical field

- **WHEN** a field declares `technical: true` and a `default`
- **AND** no action output, subprocess output mapping, column mapping or
  contract input field targets it
- **THEN** the rail shows no entry for it

#### Scenario: A non-technical field never raises this finding

- **WHEN** a field declares no `technical` key and no structural source
  writes it
- **THEN** the rail shows no entry for it under this finding
