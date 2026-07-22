# editor-structural-panels

## Purpose

Defines the structural authoring UI: panels for the field catalog, data
sources, steps (incl. per-step view), paths, timers, actions, and the
process contract, each editing the Draft model directly.

## Requirements

### Requirement: Panels cover every authorable entity in the Draft
The editor SHALL provide panels for the field catalog, data sources, steps
(including each step's per-step `view` overrides), paths, timers, actions,
and the process contract, each editing the Draft model directly. Every
entity type the contract defines SHALL be reachable and editable through
some panel — including `ProcessBody.dataSources`, a top-level entity
distinct from fields that a field's `dataSource` reference depends on.

#### Scenario: Field catalog panel creates a process-wide field
- **WHEN** an author adds a new field via the field catalog panel
- **THEN** the field is added once to the Draft's catalog and becomes
  available for reference from any step's `view`

#### Scenario: Data sources panel creates a process-wide data source
- **WHEN** an author adds a new data source via the data sources panel
  (a plugin envelope: `type`, `config`, plus `key`)
- **THEN** the data source is added once to the Draft's `dataSources` list
  and becomes selectable from any field's `dataSource` reference

#### Scenario: A field can reference a data source instead of static options
- **WHEN** an author sets a field's `dataSource` to a data source created
  in the data sources panel
- **THEN** the field catalog panel enforces that the same field's
  `options` is not also set, matching the contract's options/dataSource
  XOR invariant

#### Scenario: Step panel edits per-step view overrides
- **WHEN** an author changes a field's `required`/`visible`/`readonly`/
  `order`/`group` override on a specific step
- **THEN** the change is written to that step's `view` entry for the
  field and does not affect the field's catalog definition or any other
  step's view of the same field

#### Scenario: CEL guards are authored as text
- **WHEN** an author edits a path's guard or a timer's deadline expression
- **THEN** the panel presents and accepts the expression as raw CEL text,
  with no non-CEL condition-builder abstraction in v1

### Requirement: Panels expose wait-state and guard-priority concepts directly
The editor SHALL NOT abstract away wait-states or automatic-path
guard priority; panels SHALL surface a step's manual/automatic path
distinction and, for automatic paths, their priority ordering as explicit,
editable authoring concepts.

#### Scenario: Automatic path priority is editable
- **WHEN** a step has two or more automatic paths
- **THEN** the paths panel displays and allows editing each path's
  `priority` value

#### Scenario: Mixed manual/automatic paths are visibly distinguished
- **WHEN** viewing a step's paths in the panel
- **THEN** each path's trigger type (`manual` or `automatic`) is visible
  without opening a separate detail view
