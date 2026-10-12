# Spec Delta

## ADDED Requirements

### Requirement: The builder's date bounds are local calendar days

The builder's From and To inputs SHALL name days in the viewer's local timezone. A From day SHALL send local midnight of that day. A To day SHALL send the last millisecond of that local day. An input SHALL show the local day of the bound it holds. Clearing an input SHALL remove its bound from the query.

#### Scenario: A To day covers the whole day

- **WHEN** a process owner in Zurich picks 1 October 2026 as From and 31 October 2026 as To
- **THEN** the query has `createdAfter` at local midnight of 1 October
- **AND** the query has `createdBefore` at 23:59:59.999 local time on 31 October

#### Scenario: An instance early on the From day is in range

- **WHEN** a process owner in a timezone ahead of UTC picks one day as From
- **AND** an instance starts half an hour after local midnight on that day
- **THEN** the query bound is at or before that instance's start instant

#### Scenario: An input shows the day the owner picked

- **WHEN** the builder reads back a bound that it built from a picked day
- **THEN** the input shows the picked day, in every timezone

#### Scenario: A cleared input removes its bound

- **WHEN** a process owner clears the To input
- **THEN** the query has no `createdBefore`
- **AND** the builder raises no error

### Requirement: A failed column request shows an error where the field picker sits

When the column request fails, the builder SHALL show an error note. One note sits in the filter section and one in the column section. The note SHALL read from the area's catalog. The error type picks the key. The note SHALL stay until a later column request succeeds. A failed request SHALL NOT read as an empty field list.

#### Scenario: A failed request shows a note

- **WHEN** `POST /reporting/reports/columns` answers `500`
- **THEN** the filter section and the column section each show an error note
- **AND** neither section shows an empty-state message in its place

#### Scenario: A later success clears the note

- **WHEN** a column request fails and the owner then edits a filter
- **AND** the next column request succeeds
- **THEN** both notes disappear
- **AND** the field pickers offer the returned fields
