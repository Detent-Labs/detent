# Spec Delta

## ADDED Requirements

### Requirement: A data source kind reads as a name

A registered data source type SHALL print a plain name in the kind picker.
The type `db.list` reads "A data list an operator keeps". The type
`instance.query` reads "Cases of another process". A type the curated table does not name SHALL
fall back to its registry type.

#### Scenario: A registered kind prints its name

- **WHEN** an author opens the kind picker on a data source
- **THEN** it offers "A data list an operator keeps" and "Cases of another
  process"
- **AND** no entry reads `db.list` or `instance.query`

#### Scenario: An unnamed kind falls back to its type

- **WHEN** the registry reports a data source type the table does not name
- **THEN** the picker prints that registry type

### Requirement: A field's choices read as choices

An authoring control SHALL call a field's `options` its choices. A choice
SHALL print by its name. Its stored `value` SHALL stand only in a Developer
view, in the mono face, captioned "Stored value".

#### Scenario: The field card names choices

- **WHEN** an author opens a field carrying `options`
- **THEN** the section reads "Choices" and its add control "+ Add a choice"
- **AND** no caption reads `options` or `value`

## MODIFIED Requirements

### Requirement: The vocabulary table words kinds, sources, outcomes and flags

The rows below complete the vocabulary. `.claude/rules/ui-glossary.md`
SHALL carry the same rows.

| Contract word | Author's word |
|---|---|
| terminal step | an end |
| subprocess step | a call to another process |
| data source | where values come from |
| outcome | how it ended |
| required / readonly / visible | Required / Read-only / Asked |
| contract | what this process takes in and gives back |
| options / option value | choices / a choice's stored value |
| `db.list` / `instance.query` | a data list an operator keeps / cases of another process |

#### Scenario: The contract reads as what the process takes in and gives back

- **WHEN** an author reads the Settings tab's sub-row
- **THEN** the contract's view reads "What it takes in and gives back"
- **AND** the change list's contract group reads the same words

#### Scenario: The glossary carries the remaining rows

- **WHEN** a reader compares these rows with the glossary's table
- **THEN** every row stands in the glossary

### Requirement: Each view flag keeps one name on every surface

The `required` flag SHALL read "Required", the `readonly` flag "Read-only"
and the `visible` flag "Asked" on every authoring surface that names one.
Those surfaces are the field card's Asked on section and the form editor's
strip and card marks. The Forms tab's legend counts too. So do the field
matrix's checkbox names, its bulk badges and its legend. No two of them SHALL print one flag under two
names.

#### Scenario: The Fields tab and the form editor agree on Required

- **WHEN** an author reads a field's Asked on rows and its requiredness
  checkbox
- **AND** then reads that field's strip in the form editor
- **THEN** both print "Required" for the `required` flag

#### Scenario: The matrix legend prints the strip's words

- **WHEN** an author reads the field matrix's color legend
- **THEN** its three swatches read Asked, Required and Read-only

#### Scenario: The matrix badges print the strip's words

- **WHEN** an author reads a column header's bulk badges
- **THEN** they read Asked, Required and Read-only
