# Spec Delta

## ADDED Requirements

### Requirement: A saved report's date bounds must parse

A report query's `createdAfter` and `createdBefore` SHALL each be an ISO-8601
instant. Create, save, draft preview and column choices SHALL answer `400`
with `error.type` equal to `"request-shape"` for a bound that is not one. A
stored query with such a bound SHALL answer `400` with the same type when the
report runs. The owner and every viewer get that answer.

#### Scenario: A caller creates a report with a bound that is no date

- **WHEN** `POST /reporting/reports` has `query.createdAfter` equal to
  `"letzte Woche"`
- **THEN** the response is `400` with `error.type` equal to `"request-shape"`
- **AND** the server stores no report

#### Scenario: A stored invalid bound fails when the report runs

- **WHEN** a viewer runs a saved report whose stored `createdBefore` is not
  an ISO-8601 instant
- **THEN** the response is `400` with `error.type` equal to `"request-shape"`
- **AND** the log has no `unhandled error` entry

#### Scenario: A valid bound still runs

- **WHEN** a report has `createdAfter` equal to `"2026-10-01T00:00:00Z"`
- **THEN** it runs as before
