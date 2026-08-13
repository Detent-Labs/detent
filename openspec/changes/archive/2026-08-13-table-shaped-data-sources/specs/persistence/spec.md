<!-- antislop: allow-file passive-voice -->

## ADDED Requirements

### Requirement: The data list tables carry columns and attributes

`data_lists` SHALL carry a `columns` relation holding the list's declared
column entries, and `data_list_values` SHALL carry an `attributes` relation
holding one value's attribute map. Both SHALL be `jsonb`, both SHALL be
`NOT NULL`, and both SHALL default to the empty case: `'[]'` for `columns` and
`'{}'` for `attributes`.

The defaults are what keep the addition free of a data migration. Every row an
existing deployment holds reads as a list with no columns. Its values read as
values with no attributes. That is exactly its behavior before this change.

Neither relation joins the audit backbone. Both are operator configuration, and
no append-only rule applies to either.

#### Scenario: An existing list reads as a list with no columns
- **WHEN** the schema is applied over a deployment whose `data_lists` rows
  predate this change
- **THEN** every such row carries an empty `columns`, and every value of it
  carries an empty `attributes`

#### Scenario: The cascade still fires on list deletion
- **WHEN** a list is deleted
- **THEN** its values go with it, attributes and all
