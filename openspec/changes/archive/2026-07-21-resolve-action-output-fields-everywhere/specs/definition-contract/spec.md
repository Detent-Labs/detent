## ADDED Requirements

### Requirement: Action.output targets resolve against the full recursive field set, from every action position

An `Action.output` target key SHALL resolve against every field id in the
body, including fields nested at any depth inside a `group` field — matching
the field set `view.fields[].ref` already resolves against and the field set
the CEL layer already type-checks `Action.output` expressions against. This
SHALL be checked from every action position an `Action` can appear in: a
step's `onEntry`, `onExit`, and `onCancel`; a path's `onPath`; and a timer's
`onFire.actions`. A body where any `Action.output` in any of these five
positions targets a field id absent from the catalog SHALL fail to parse.

#### Scenario: An onEntry action output targeting an unknown field is rejected
- **WHEN** a step's `onEntry` includes an action whose `output` targets a field id absent from the catalog
- **THEN** the process body fails to parse

#### Scenario: An onExit action output targeting an unknown field is rejected
- **WHEN** a step's `onExit` includes an action whose `output` targets a field id absent from the catalog
- **THEN** the process body fails to parse

#### Scenario: An onCancel action output targeting an unknown field is rejected
- **WHEN** a step's `onCancel` includes an action whose `output` targets a field id absent from the catalog
- **THEN** the process body fails to parse

#### Scenario: An onPath action output targeting an unknown field is rejected
- **WHEN** a path's `onPath` includes an action whose `output` targets a field id absent from the catalog
- **THEN** the process body fails to parse

#### Scenario: A timer onFire action output targeting an unknown field is rejected
- **WHEN** a timer's `onFire.actions` includes an action whose `output` targets a field id absent from the catalog
- **THEN** the process body fails to parse

#### Scenario: An output target resolving to a nested group field is accepted, from every position
- **WHEN** an `Action.output` in any of the five positions targets a field id declared inside a `group` field's `fields`
- **THEN** the process body parses successfully (subject to every other invariant)
