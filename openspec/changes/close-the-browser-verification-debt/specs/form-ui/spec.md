## ADDED Requirements

### Requirement: A body with no layout keys renders as it rendered before

`view.columns` and `viewField.span` arrived with the form-editor change. A
version published before that change declares neither. Published versions are
immutable, so such a body outlives every renderer change.

`FieldForm` SHALL render such a body in one column. Its group members SHALL
stack. `test/view-layout-hash.test.ts` already pins the hash against both keys.
The suite SHALL pin the render too.

`effectiveSpan` is pure and exported, so the assertion needs no browser and no
DOM.

#### Scenario: An omitted columns key means one column

- **WHEN** a stored view declares no `columns`
- **THEN** `FieldForm` renders one column

#### Scenario: A span never exceeds the grid

- **WHEN** a field declares `span: 2` inside a one-column form
- **THEN** `effectiveSpan` answers 1, and the field draws full width

#### Scenario: A group's members stack

- **WHEN** a one-column form holds a group field
- **THEN** its members render stacked, as they rendered before the layout keys
  existed
