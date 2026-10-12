# Spec Delta

## ADDED Requirements

### Requirement: The raw JSON text follows the stored config

The raw JSON textarea of a plugin envelope SHALL show the stored `config` of the entity it belongs to. It SHALL show the author's own text only while that text still matches the stored `config`. Invalid JSON, which writes nothing, stays on screen until the stored `config` moves. Any other write to the stored `config` SHALL replace the text with the new `config`. The next keystroke SHALL start from it.

#### Scenario: A picked list key shows in the textarea

- **WHEN** a `db.list` data source holds `{}` and the author picks the list `countries`
- **THEN** the textarea reads `{ "listKey": "countries" }`
- **AND** typing one character and deleting it leaves `listKey` in the draft

#### Scenario: A generated form write shows after a switch to JSON

- **WHEN** the author sets a value in the generated form
- **AND** the author presses "Switch to JSON"
- **THEN** the textarea shows the stored `config` with that value

#### Scenario: The author's own text stays while it matches

- **WHEN** the author types valid JSON that parses to the stored `config`
- **THEN** the textarea keeps the exact text the author typed

#### Scenario: Invalid JSON stays while the stored config holds

- **WHEN** the author types text that is not valid JSON
- **THEN** the textarea keeps that text and an error line names what is wrong
- **AND** the draft keeps the last valid `config`

#### Scenario: A write from elsewhere replaces invalid text

- **WHEN** the textarea holds invalid JSON
- **AND** a picker elsewhere writes to the same `config`
- **THEN** the textarea shows the stored `config`
- **AND** the error line leaves

### Requirement: An entity editor mounts per entity

The step page SHALL mount once per step. The data source editor SHALL mount once per data source. Moving to another step, or to another data source, SHALL start the editor fresh. The JSON mode, the text and the error line of the earlier entity SHALL NOT carry over.

#### Scenario: Next does not carry a JSON switch

- **WHEN** the author presses "Switch to JSON" on the assignment of step A
- **AND** the author presses "Next" to reach step B
- **THEN** the assignment of step B shows its generated form
- **AND** the assignment config shown is the one B holds

#### Scenario: A keystroke on step B writes only to step B

- **WHEN** the author reaches step B from step A, and types in B's assignment
- **THEN** step A keeps the config it held before

#### Scenario: Another data source starts fresh

- **WHEN** the author opens a second data source from the entity rail
- **THEN** the editor shows the second source's own `config`
