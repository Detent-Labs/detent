# Spec Delta

## ADDED Requirements

### Requirement: Removing a data source that fields use confirms first

A data source is in use when at least one field names its id in `dataSource`. Remove data source SHALL remove an unused source at once, with no dialog. A source in use SHALL first confirm in a modal dialog of the studio's own. The browser's `confirm()` prompt SHALL NOT serve. The dialog SHALL take the treatment of the field removal dialog. Cancel SHALL hold the initial focus.

#### Scenario: An unused source leaves at once

- **WHEN** no field names the data source `countries`
- **AND** the author presses Remove data source
- **THEN** the data source leaves the draft
- **AND** no dialog opens

#### Scenario: A source in use asks first

- **WHEN** three fields name the data source `countries`
- **AND** the author presses Remove data source
- **THEN** a modal dialog opens and the draft still holds the source
- **AND** Cancel holds the focus

#### Scenario: Declining keeps the draft

- **WHEN** the author cancels the dialog, or dismisses it with Escape
- **THEN** the draft stays unchanged
- **AND** Remove data source holds the focus again

### Requirement: The data source removal dialog counts what it clears

The dialog SHALL name the data source by its key. Its facts SHALL state the count of fields that name the source, at every depth. They SHALL state the count of column mapping entries those fields carry. They SHALL print no row for a count of zero. The dialog SHALL name no field.

#### Scenario: The facts count fields and mappings

- **WHEN** three fields name `countries` and one of them carries a column mapping
- **AND** the author presses Remove data source
- **THEN** the facts state 3 fields and 1 column mapping

#### Scenario: A zero count prints no row

- **WHEN** two fields name `countries` and none carries a column mapping
- **AND** the author presses Remove data source
- **THEN** the facts state 2 fields
- **AND** the facts have no column mapping row

### Requirement: Removing a data source clears its field references in one draft change

Confirming SHALL remove the data source from the draft. In the same draft change it SHALL remove `dataSource` from every field that named the source. It SHALL also remove `columnMapping` from each of those fields. No field SHALL keep an id that resolves to nothing. The Checks tab SHALL report no unresolved `dataSource` for the removed source.

#### Scenario: References leave with the source

- **WHEN** the author confirms the removal of `countries`, which three fields named
- **THEN** the draft has no data source `countries`
- **AND** none of the three fields holds `dataSource` or `columnMapping`

#### Scenario: Other fields stay as they are

- **WHEN** the author confirms that removal
- **THEN** a field that names another data source keeps its `dataSource`

#### Scenario: The Checks tab reports nothing for the removed source

- **WHEN** the author confirms the removal
- **THEN** the Checks tab lists no unresolved `dataSource` finding

### Requirement: A removal moves focus to the rail

After a removal, keyboard focus SHALL land on the rail row that becomes current. An empty rail SHALL hand focus to its first add control. Focus SHALL NOT stay on a control that now removes a neighbour.

#### Scenario: Removing a step hands focus to the steps rail

- **WHEN** the author presses Remove this step on step 2 of 4
- **THEN** the steps rail row of the step that becomes current holds the focus

#### Scenario: Removing the last data source hands focus to Add

- **WHEN** the author removes the only data source
- **THEN** the Add data source control holds the focus
