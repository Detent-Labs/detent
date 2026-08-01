## ADDED Requirements

### Requirement: initSchema creates the data list relations

`initSchema` SHALL create `data_lists` and `data_list_values` through the
same `CREATE TABLE IF NOT EXISTS` path it already uses for the other
relations.

`data_lists` holds `list_key` as its primary key, `label`, an optional
`description`, `updated_at`, and `updated_by`.

`data_list_values` holds `list_key`, `value`, a `jsonb` `label`, `active`,
`sort_order`, `updated_at`, and `updated_by`. Its key is
`(list_key, value)`. It references `data_lists` with `ON DELETE CASCADE`.

These two relations sit outside the audit backbone. They hold configuration
that an operator changes, not a record of what an instance did. No
append-only rule applies to them.

#### Scenario: Both relations exist after schema init
- **WHEN** `initSchema` runs against an empty database
- **THEN** `data_lists` and `data_list_values` exist

#### Scenario: Deleting a list takes its values with it
- **WHEN** a caller deletes a `data_lists` row
- **THEN** the values of that list go with it

#### Scenario: Schema init stays repeatable
- **WHEN** `initSchema` runs twice
- **THEN** the second run changes nothing and raises nothing
