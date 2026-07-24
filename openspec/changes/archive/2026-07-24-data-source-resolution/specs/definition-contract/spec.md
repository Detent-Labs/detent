## ADDED Requirements

### Requirement: A field's dataSource reference resolves to a declared data source

A `FieldDef.dataSource` value SHALL resolve to an id present in
`body.dataSources`. A body where any field's `dataSource` names an id absent
from `body.dataSources` SHALL fail to parse. This is checked in the same
`superRefine` block that already checks duplicate data source ids/keys,
closing an authoring gap that previously let a typo'd or deleted data-source
id publish silently — the field would then have no way to resolve options at
runtime.

#### Scenario: A field's dataSource resolving to a declared data source parses
- **WHEN** a `FieldDef.dataSource` names an id present in `body.dataSources`
- **THEN** the process body parses successfully (subject to every other
  invariant)

#### Scenario: A field's dataSource naming an unknown id is rejected
- **WHEN** a `FieldDef.dataSource` names an id absent from `body.dataSources`
- **THEN** the process body fails to parse

#### Scenario: A field's dataSource nested inside a group is checked the same way
- **WHEN** a field nested inside a `group` field's `fields` declares a
  `dataSource` naming an id absent from `body.dataSources`
- **THEN** the process body fails to parse, matching the check applied to a
  top-level field
