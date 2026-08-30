## Why

The report builder (`reporting-data-tables`) renders a table over instance
field values, but nobody can get the table out of the browser. HR builds a
table over the last twelve months of onboardings and wants it in a
spreadsheet. There is no route for that.

`docs/decisions.md`'s "Instance data tables" entry names this as the
deliberately deferred next step. It states that a table download is the
obvious next request. CSV for a department, NDJSON for a machine, remains
unbuilt. This change builds the CSV half.

## What Changes

- A new `GET /reporting/reports/:reportId/table.csv` route, beside
  `handleExecuteReport`. It reuses `executeReport()` unchanged: the same
  report-membership gate, the same process `read` permission gate, and the
  same data. An actor who passes membership but fails `read` gets an empty
  CSV. This matches the JSON route's "sharing narrows access, never widens
  it" rule. No new authorization logic.
- A pure `reportResultToCsv()` serializer in `src/runtime/api.ts`, over the
  same `ReportExecutionResult` the JSON route already returns. It writes
  standard RFC 4180 CSV. Each row holds one instance. The header row holds
  a field column's own `fieldId`, or a merge column's joined source
  `fieldId`s.
- The serializer keeps the table's three-way empty-cell rule distinct in
  plain text. A no-value cell, a not-in-this-version cell and a redacted
  cell each get their own marker text. None collapses into one blank cell. A
  CSV that blanks all three recreates the exact reading error the table's own
  distinct rendering avoids.
- The route returns `HttpBinaryResult` (`text/csv; charset=utf-8`,
  `Content-Disposition: attachment`). `server.ts`'s `BINARY_ROUTES` ledger
  gets a new entry for it, next to the existing attachment download.
- A "Download CSV" control in `ReportBuilderScreen.tsx`. It appears once the
  author has saved the report and a `reportId` exists. It fetches the new
  route as a `Blob` and triggers a browser download. This is the same
  `Blob` plus `URL.createObjectURL` plus `<a download>` pattern the app
  area's attachment download already uses. A plain `<a href>` cannot carry
  the bearer-header auth this API needs.
- New EN/DE catalog keys in the reporting area's catalog for the new control.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `reporting-data-tables`: adds a CSV export of a saved report's table,
  alongside the existing JSON execution route. The export keeps the same
  authorization and the same three-way empty-cell distinction.
- `reporting-app`: adds the "Download CSV" control to the report builder
  screen. Only a saved report, one already carrying a `reportId`, shows the
  control.

## Impact

- `src/runtime/api.ts`: new pure `reportResultToCsv()` (and a small
  CSV-escaping helper), exported for a unit test. No change to
  `executeReport()` or its gates.
- `src/http/reporting-routes.ts`: new `handleExecuteReportCsv()` handler.
- `src/http/server.ts`: new route registration, and a new `BINARY_ROUTES`
  entry.
- `test/http-disposition.test.ts`: extended to cover the new route's
  `:reportId` placeholder alongside the existing attachment-route
  placeholders.
- New `test/reporting-csv.test.ts` (or an addition to an existing reporting
  test file) covers the three-way empty-cell markers. It also covers both
  authorization outcomes: membership refusal, and read-permission narrowing
  to an empty result.
- `packages/web/src/areas/reporting/api/client.ts`: new `downloadReportCsv()`
  returning a `Blob`.
- `packages/web/src/areas/reporting/screens/ReportBuilderScreen.tsx`: new
  "Download CSV" control.
- `packages/web/src/i18n/catalogs/reporting.ts`: new EN/DE key(s).
- This is a UI change, so `docs/browser-checks.md` requires a browser check.
  Start the server in the devcontainer, drive the download with
  `playwright-cli`, and inspect the downloaded CSV's content.
