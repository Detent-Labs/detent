## MODIFIED Requirements

### Requirement: The editor appears only where a mapping can publish

The editor SHALL appear for a `string` field bound to a `"db.list"` data
source, and for no other field.

Two of those conditions come from the engine. `checkColumnMapping` refuses a
mapping on a field carrying no `dataSource`. It refuses one on a field whose
type is not `string`. An editor offered there would invite an author to build a
publish error, which the checks rail then reports.

The `"db.list"` narrowing is this editor's own. Only a data list declares
columns, so no other source type gives the picker anything to offer. A mapping
on such a source stays authorable in the JSON view, since the engine permits
it.

Losing either condition SHALL hide the editor. The field's stored
`columnMapping` SHALL survive that, so restoring the condition restores the
rows. A `list` field picks several rows for one target. The author who switches
back has not asked to drop the mapping.

<!-- Scenario titles stay verbatim: the OpenSpec archive step matches each block by exact title. -->
#### Scenario: A select field bound to a data list shows the editor

- **WHEN** an author opens a `string` field bound to a `"db.list"` source
- **THEN** the editor appears

#### Scenario: A field with inline options shows no editor

- **WHEN** an author opens a `string` field carrying inline `options`
- **THEN** the editor does not appear

#### Scenario: A multiselect shows no editor

- **WHEN** an author switches a mapping field's type to `list`
- **THEN** the editor does not appear, and the draft keeps the field's
  `columnMapping`

#### Scenario: Restoring the type restores the rows

- **WHEN** that author switches the type back to `string`
- **THEN** the editor shows the rows the field still carried
